/**
 * Gas Optimizer - Transaction cost optimization with EIP-1559 support
 * 
 * Monitors gas prices and optimizes transaction execution with:
 * - Real-time gas price monitoring across multiple chains
 * - EIP-1559 dynamic fee calculation (maxPriorityFee, maxFee)
 * - Gas price monitoring every 30 seconds
 * - User-defined gas price thresholds
 * - Transaction queueing for high gas periods
 * - Automatic queue processing when gas drops
 * - Comprehensive error handling for RPC failures
 * - L2 gas optimization with adjusted thresholds for Arbitrum and Optimism
 * 
 * Requirements: 6.1, 6.2, 6.6, 6.7
 */

import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';

/**
 * Default gas price thresholds by chain (in gwei)
 */
const DEFAULT_GAS_THRESHOLDS = {
  1: 50,      // Ethereum mainnet
  42161: 0.1, // Arbitrum
  10: 0.01    // Optimism
};

/**
 * L2 network identifiers
 */
const L2_CHAINS = new Set([42161, 10]); // Arbitrum, Optimism

/**
 * L2-specific gas cost threshold multipliers
 * L2 networks have much lower gas costs, so we adjust thresholds accordingly
 */
const L2_THRESHOLD_MULTIPLIERS = {
  42161: 10,  // Arbitrum: 10x more lenient (gas is ~10x cheaper)
  10: 20      // Optimism: 20x more lenient (gas is ~20x cheaper)
};

/**
 * Transaction priority levels
 */
const PRIORITY_LEVELS = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4
};

/**
 * Chain configurations
 */
const CHAIN_CONFIGS = {
  1: {
    name: 'Ethereum',
    rpcUrl: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
    supportsEIP1559: true
  },
  42161: {
    name: 'Arbitrum',
    rpcUrl: process.env.ARB_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    supportsEIP1559: true
  },
  10: {
    name: 'Optimism',
    rpcUrl: process.env.OP_RPC_URL || 'https://mainnet.optimism.io',
    supportsEIP1559: true
  }
};

/**
 * Gas Optimizer class
 */
export class GasOptimizer {
  constructor(config = {}) {
    this.chainId = config.chainId || 1;
    this.providers = new Map();
    
    // Gas price thresholds (in gwei)
    this.gasThresholds = config.gasThresholds || DEFAULT_GAS_THRESHOLDS;
    
    // Monitoring configuration
    this.monitoringInterval = config.monitoringInterval || 30000; // 30 seconds
    this.monitoringTimer = null;
    this.isMonitoring = false;
    
    // Gas price history for each chain
    this.gasPriceHistory = new Map();
    this.maxHistorySize = config.maxHistorySize || 20;
    
    // Current gas prices cache
    this.currentGasPrices = new Map();
    
    // EIP-1559 configuration
    this.maxPriorityFeePerGas = config.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei'); // 2 gwei
    this.maxFeeMultiplier = config.maxFeeMultiplier || 1.5; // 1.5x base fee
    
    // Retry configuration
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    
    // Callbacks for monitoring events
    this.onGasPriceUpdate = config.onGasPriceUpdate || null;
    this.onThresholdMet = config.onThresholdMet || null;
    
    // Transaction queue
    this.transactionQueue = new Map(); // chainId -> array of queued transactions
    this.queuePersistencePath = config.queuePersistencePath || './.gas-optimizer-queue.json';
    this.onTransactionExecuted = config.onTransactionExecuted || null;
    this.nextQueueId = 1;
  }

  /**
   * Initialize the gas optimizer
   */
  async initialize() {
    try {
      // Initialize providers for all supported chains
      for (const [chainId, chainConfig] of Object.entries(CHAIN_CONFIGS)) {
        const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
        this.providers.set(parseInt(chainId), provider);
        
        // Verify connection
        const network = await provider.getNetwork();
        console.log(` Gas Optimizer connected to ${chainConfig.name} (Chain ${network.chainId})`);
      }
      
      // Fetch initial gas prices
      await this._updateAllGasPrices();
      
      // Load persisted queue
      await this._loadQueue();
      
      return true;
    } catch (error) {
      console.error(' Failed to initialize Gas Optimizer:', error.message);
      throw error;
    }
  }

  /**
   * Get current gas price for a specific chain
   * @param {number} chainId - Chain ID (1 for Ethereum, 42161 for Arbitrum, 10 for Optimism)
   * @returns {Promise<Object>} Gas price data with EIP-1559 fields
   */
  async getCurrentGasPrice(chainId = null) {
    const targetChainId = chainId || this.chainId;
    
    try {
      const provider = this.providers.get(targetChainId);
      if (!provider) {
        throw new Error(`No provider configured for chain ${targetChainId}`);
      }

      const chainConfig = CHAIN_CONFIGS[targetChainId];
      if (!chainConfig) {
        throw new Error(`Unsupported chain ${targetChainId}`);
      }

      // Fetch fee data with retry logic
      const feeData = await this._retryCall(async () => {
        return await provider.getFeeData();
      });

      let gasPrice;
      
      if (chainConfig.supportsEIP1559 && feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        // EIP-1559 transaction
        const baseFee = feeData.maxFeePerGas - feeData.maxPriorityFeePerGas;
        
        gasPrice = {
          type: 'eip1559',
          chainId: targetChainId,
          chainName: chainConfig.name,
          baseFeePerGas: baseFee,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
          maxFeePerGas: feeData.maxFeePerGas,
          // Calculated values in gwei for easy comparison
          baseFeeGwei: parseFloat(ethers.formatUnits(baseFee, 'gwei')),
          maxPriorityFeeGwei: parseFloat(ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei')),
          maxFeeGwei: parseFloat(ethers.formatUnits(feeData.maxFeePerGas, 'gwei')),
          timestamp: Date.now()
        };
      } else {
        // Legacy transaction
        gasPrice = {
          type: 'legacy',
          chainId: targetChainId,
          chainName: chainConfig.name,
          gasPrice: feeData.gasPrice,
          gasPriceGwei: parseFloat(ethers.formatUnits(feeData.gasPrice, 'gwei')),
          timestamp: Date.now()
        };
      }

      // Update cache
      this.currentGasPrices.set(targetChainId, gasPrice);
      
      // Update history
      this._updateHistory(targetChainId, gasPrice);

      return gasPrice;
    } catch (error) {
      console.error(` Failed to get gas price for chain ${targetChainId}:`, error.message);
      
      // Return cached price if available
      const cached = this.currentGasPrices.get(targetChainId);
      if (cached) {
        console.log(`  Using cached gas price for chain ${targetChainId}`);
        return cached;
      }
      
      throw error;
    }
  }

  /**
   * Calculate EIP-1559 fees based on current base fee
   * @param {number} chainId - Chain ID
   * @param {Object} options - Fee calculation options
   * @returns {Promise<Object>} Calculated maxPriorityFeePerGas and maxFeePerGas
   */
  async calculateEIP1559Fees(chainId = null, options = {}) {
    const targetChainId = chainId || this.chainId;
    
    try {
      const gasPrice = await this.getCurrentGasPrice(targetChainId);
      
      if (gasPrice.type !== 'eip1559') {
        throw new Error(`Chain ${targetChainId} does not support EIP-1559`);
      }

      // Use custom values or defaults
      const maxPriorityFeePerGas = options.maxPriorityFeePerGas || this.maxPriorityFeePerGas;
      const maxFeeMultiplier = options.maxFeeMultiplier || this.maxFeeMultiplier;

      // Calculate maxFeePerGas = baseFee * multiplier + maxPriorityFee
      const baseFee = gasPrice.baseFeePerGas;
      const maxFeePerGas = (baseFee * BigInt(Math.floor(maxFeeMultiplier * 100)) / 100n) + maxPriorityFeePerGas;

      return {
        maxPriorityFeePerGas,
        maxFeePerGas,
        baseFeePerGas: baseFee,
        // Human-readable values
        maxPriorityFeeGwei: parseFloat(ethers.formatUnits(maxPriorityFeePerGas, 'gwei')),
        maxFeeGwei: parseFloat(ethers.formatUnits(maxFeePerGas, 'gwei')),
        baseFeeGwei: parseFloat(ethers.formatUnits(baseFee, 'gwei')),
        chainId: targetChainId
      };
    } catch (error) {
      console.error(` Failed to calculate EIP-1559 fees for chain ${targetChainId}:`, error.message);
      throw error;
    }
  }

  /**
   * Start monitoring gas prices across all chains
   */
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('  Gas monitoring is already running');
      return;
    }

    console.log(` Starting gas price monitoring (interval: ${this.monitoringInterval}ms)`);
    this.isMonitoring = true;

    // Initial update
    this._updateAllGasPrices();

    // Set up periodic monitoring
    this.monitoringTimer = setInterval(async () => {
      await this._updateAllGasPrices();
    }, this.monitoringInterval);
  }

  /**
   * Stop monitoring gas prices
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('  Gas monitoring is not running');
      return;
    }

    console.log('⏹  Stopping gas price monitoring');
    this.isMonitoring = false;

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
  }

  /**
   * Check if current gas price is below threshold for a chain
   * @param {number} chainId - Chain ID
   * @returns {boolean} True if gas is below threshold
   */
  isGasBelowThreshold(chainId = null) {
    const targetChainId = chainId || this.chainId;
    const gasPrice = this.currentGasPrices.get(targetChainId);
    
    if (!gasPrice) {
      return false;
    }

    const threshold = this.gasThresholds[targetChainId];
    if (!threshold) {
      return true; // No threshold set, always allow
    }

    const currentGwei = gasPrice.type === 'eip1559' 
      ? gasPrice.maxFeeGwei 
      : gasPrice.gasPriceGwei;

    return currentGwei <= threshold;
  }

  /**
   * Get gas price history for a chain
   * @param {number} chainId - Chain ID
   * @returns {Array} Array of historical gas prices
   */
  getGasHistory(chainId = null) {
    const targetChainId = chainId || this.chainId;
    return this.gasPriceHistory.get(targetChainId) || [];
  }

  /**
   * Set gas price threshold for a chain
   * @param {number} chainId - Chain ID
   * @param {number} thresholdGwei - Threshold in gwei
   */
  setGasThreshold(chainId, thresholdGwei) {
    this.gasThresholds[chainId] = thresholdGwei;
    console.log(` Set gas threshold for chain ${chainId}: ${thresholdGwei} gwei`);
  }

  /**
   * Get all current gas prices
   * @returns {Map} Map of chainId to gas price data
   */
  getAllGasPrices() {
    return new Map(this.currentGasPrices);
  }

  /**
   * Switch active chain
   * @param {number} chainId - New chain ID
   */
  switchChain(chainId) {
    if (!CHAIN_CONFIGS[chainId]) {
      throw new Error(`Unsupported chain ${chainId}`);
    }
    
    this.chainId = chainId;
    console.log(` Switched to chain ${chainId} (${CHAIN_CONFIGS[chainId].name})`);
  }

  /**
   * Update gas prices for all chains
   * @private
   */
  async _updateAllGasPrices() {
    const updatePromises = [];
    
    for (const chainId of this.providers.keys()) {
      updatePromises.push(
        this.getCurrentGasPrice(chainId).catch(error => {
          console.error(`Failed to update gas price for chain ${chainId}:`, error.message);
          return null;
        })
      );
    }

    const results = await Promise.all(updatePromises);
    
    // Trigger callbacks
    if (this.onGasPriceUpdate) {
      results.forEach(gasPrice => {
        if (gasPrice) {
          this.onGasPriceUpdate(gasPrice);
        }
      });
    }

    // Check thresholds and process queued transactions
    if (this.onThresholdMet) {
      for (const chainId of this.providers.keys()) {
        if (this.isGasBelowThreshold(chainId)) {
          this.onThresholdMet(chainId, this.currentGasPrices.get(chainId));
        }
      }
    }

    // Process queued transactions when gas drops below threshold
    for (const chainId of this.providers.keys()) {
      if (this.isGasBelowThreshold(chainId)) {
        const queue = this.transactionQueue.get(chainId);
        if (queue && queue.length > 0) {
          // Process queue asynchronously
          this.processQueue(chainId).catch(error => {
            console.error(`Failed to process queue for chain ${chainId}:`, error.message);
          });
        }
      }
    }
  }

  /**
   * Update gas price history
   * @private
   */
  _updateHistory(chainId, gasPrice) {
    if (!this.gasPriceHistory.has(chainId)) {
      this.gasPriceHistory.set(chainId, []);
    }

    const history = this.gasPriceHistory.get(chainId);
    history.push(gasPrice);

    // Limit history size
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Retry a function call with exponential backoff
   * @private
   */
  async _retryCall(fn) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          console.log(`  Retry attempt ${attempt}/${this.maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Get supported chains
   * @returns {Array} Array of supported chain configurations
   */
  getSupportedChains() {
    return Object.entries(CHAIN_CONFIGS).map(([chainId, config]) => ({
      chainId: parseInt(chainId),
      name: config.name,
      supportsEIP1559: config.supportsEIP1559
    }));
  }

  /**
   * Check if a chain is an L2 network
   * @param {number} chainId - Chain ID to check
   * @returns {boolean} True if chain is an L2 network
   */
  isL2Chain(chainId = null) {
    const targetChainId = chainId || this.chainId;
    return L2_CHAINS.has(targetChainId);
  }

  /**
   * Get the adjusted gas cost threshold for a chain
   * Requirement 6.7: Adjust thresholds for L2 networks with lower gas costs
   * @param {number} chainId - Chain ID
   * @param {number} baseThresholdPercent - Base threshold percentage (default 2%)
   * @returns {number} Adjusted threshold percentage
   */
  getAdjustedGasThreshold(chainId = null, baseThresholdPercent = 2.0) {
    const targetChainId = chainId || this.chainId;
    
    if (this.isL2Chain(targetChainId)) {
      const multiplier = L2_THRESHOLD_MULTIPLIERS[targetChainId] || 1;
      return baseThresholdPercent * multiplier;
    }
    
    return baseThresholdPercent;
  }

  /**
   * Queue a transaction for later execution when gas prices drop
   * @param {Object} transaction - Transaction object
   * @param {Object} options - Queueing options
   * @returns {Object} Queued transaction with ID
   */
  queueTransaction(transaction, options = {}) {
    const chainId = transaction.chainId || this.chainId;
    const priority = options.priority || PRIORITY_LEVELS.MEDIUM;
    const maxGasPrice = options.maxGasPrice || this.gasThresholds[chainId];
    
    if (!maxGasPrice) {
      throw new Error(`No gas threshold set for chain ${chainId}. Cannot queue transaction.`);
    }

    // Create queued transaction
    const queuedTx = {
      id: this.nextQueueId++,
      chainId,
      transaction,
      priority,
      maxGasPrice,
      estimatedGas: options.estimatedGas || null,
      metadata: options.metadata || {},
      queuedAt: Date.now(),
      attempts: 0,
      lastAttempt: null
    };

    // Add to queue
    if (!this.transactionQueue.has(chainId)) {
      this.transactionQueue.set(chainId, []);
    }
    
    const queue = this.transactionQueue.get(chainId);
    queue.push(queuedTx);
    
    // Sort by priority (highest first)
    queue.sort((a, b) => b.priority - a.priority);

    console.log(` Queued transaction ${queuedTx.id} for chain ${chainId} (priority: ${priority}, max gas: ${maxGasPrice} gwei)`);

    // Persist queue
    this._persistQueue().catch(error => {
      console.error('Failed to persist queue:', error.message);
    });

    return queuedTx;
  }

  /**
   * Determine if a transaction should be executed now based on current gas prices
   * @param {Object} transaction - Transaction or queued transaction object
   * @param {Object} options - Decision options
   * @returns {Object} Decision object with shouldExecute flag and reason
   */
  shouldExecuteNow(transaction, options = {}) {
    const chainId = transaction.chainId || this.chainId;
    const urgency = options.urgency || 'normal'; // 'low', 'normal', 'high', 'urgent'
    const maxGasPrice = transaction.maxGasPrice || options.maxGasPrice || this.gasThresholds[chainId];

    // Get current gas price
    const currentGasPrice = this.currentGasPrices.get(chainId);
    
    if (!currentGasPrice) {
      return {
        shouldExecute: false,
        reason: 'Gas price data not available',
        currentGasGwei: null,
        maxGasGwei: maxGasPrice,
        chainId,
        isL2: this.isL2Chain(chainId)
      };
    }

    const currentGasGwei = currentGasPrice.type === 'eip1559' 
      ? currentGasPrice.maxFeeGwei 
      : currentGasPrice.gasPriceGwei;

    // Requirement 6.7: Adjust decision logic for L2 networks
    const isL2 = this.isL2Chain(chainId);
    const chainName = CHAIN_CONFIGS[chainId]?.name || `Chain ${chainId}`;

    // Urgent transactions always execute
    if (urgency === 'urgent') {
      return {
        shouldExecute: true,
        reason: 'Urgent transaction - executing regardless of gas price',
        currentGasGwei,
        maxGasGwei: maxGasPrice,
        chainId,
        chainName,
        isL2
      };
    }

    // Check if gas is below threshold
    if (currentGasGwei <= maxGasPrice) {
      return {
        shouldExecute: true,
        reason: `Gas price (${currentGasGwei.toFixed(4)} gwei) is below threshold (${maxGasPrice} gwei)${isL2 ? ' [L2 network]' : ''}`,
        currentGasGwei,
        maxGasGwei: maxGasPrice,
        chainId,
        chainName,
        isL2
      };
    }

    // L2 networks: More lenient execution due to lower absolute costs
    // Even if gas is above threshold, the absolute cost is still very low
    if (isL2) {
      // On L2, execute if within 50% of threshold (gas is cheap anyway)
      if (currentGasGwei <= maxGasPrice * 1.5) {
        return {
          shouldExecute: true,
          reason: `L2 network (${chainName}): Gas price (${currentGasGwei.toFixed(4)} gwei) is within acceptable range despite being above threshold`,
          currentGasGwei,
          maxGasGwei: maxGasPrice,
          chainId,
          chainName,
          isL2
        };
      }
    }

    // High urgency: execute if within 20% of threshold
    if (urgency === 'high' && currentGasGwei <= maxGasPrice * 1.2) {
      return {
        shouldExecute: true,
        reason: `High urgency and gas price (${currentGasGwei.toFixed(4)} gwei) is within 20% of threshold${isL2 ? ' [L2 network]' : ''}`,
        currentGasGwei,
        maxGasGwei: maxGasPrice,
        chainId,
        chainName,
        isL2
      };
    }

    return {
      shouldExecute: false,
      reason: `Gas price (${currentGasGwei.toFixed(4)} gwei) exceeds threshold (${maxGasPrice} gwei)${isL2 ? ' [L2 network]' : ''}`,
      currentGasGwei,
      maxGasGwei: maxGasPrice,
      chainId,
      chainName,
      isL2
    };
  }

  /**
   * Process queued transactions for a specific chain
   * @param {number} chainId - Chain ID
   * @returns {Promise<Array>} Array of execution results
   */
  async processQueue(chainId = null) {
    const targetChainId = chainId || this.chainId;
    const queue = this.transactionQueue.get(targetChainId);

    if (!queue || queue.length === 0) {
      return [];
    }

    console.log(` Processing ${queue.length} queued transactions for chain ${targetChainId}`);

    const results = [];
    const remainingQueue = [];

    for (const queuedTx of queue) {
      const decision = this.shouldExecuteNow(queuedTx);

      if (decision.shouldExecute) {
        console.log(` Executing queued transaction ${queuedTx.id}: ${decision.reason}`);
        
        try {
          // Execute transaction (callback to external executor)
          if (this.onTransactionExecuted) {
            const result = await this.onTransactionExecuted(queuedTx);
            results.push({
              queuedTx,
              success: true,
              result,
              executedAt: Date.now()
            });
          } else {
            // No executor callback - just mark as ready
            results.push({
              queuedTx,
              success: true,
              result: { status: 'ready_for_execution' },
              executedAt: Date.now()
            });
          }
        } catch (error) {
          console.error(` Failed to execute transaction ${queuedTx.id}:`, error.message);
          
          queuedTx.attempts++;
          queuedTx.lastAttempt = Date.now();
          
          // Retry up to 3 times
          if (queuedTx.attempts < 3) {
            remainingQueue.push(queuedTx);
          } else {
            results.push({
              queuedTx,
              success: false,
              error: error.message,
              executedAt: Date.now()
            });
          }
        }
      } else {
        // Keep in queue
        remainingQueue.push(queuedTx);
      }
    }

    // Update queue
    this.transactionQueue.set(targetChainId, remainingQueue);

    // Persist updated queue
    await this._persistQueue();

    if (results.length > 0) {
      console.log(` Processed ${results.length} transactions, ${remainingQueue.length} remaining in queue`);
    }

    return results;
  }

  /**
   * Get all queued transactions
   * @param {number} chainId - Optional chain ID filter
   * @returns {Array} Array of queued transactions
   */
  getQueuedTransactions(chainId = null) {
    if (chainId) {
      return this.transactionQueue.get(chainId) || [];
    }

    // Return all queued transactions across all chains
    const allQueued = [];
    for (const [chain, queue] of this.transactionQueue) {
      allQueued.push(...queue.map(tx => ({ ...tx, chainId: chain })));
    }
    
    // Sort by priority and queue time
    allQueued.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.queuedAt - b.queuedAt;
    });

    return allQueued;
  }

  /**
   * Remove a transaction from the queue
   * @param {number} transactionId - Transaction ID
   * @returns {boolean} True if removed
   */
  removeFromQueue(transactionId) {
    for (const [chainId, queue] of this.transactionQueue) {
      const index = queue.findIndex(tx => tx.id === transactionId);
      if (index !== -1) {
        queue.splice(index, 1);
        console.log(`  Removed transaction ${transactionId} from queue`);
        
        this._persistQueue().catch(error => {
          console.error('Failed to persist queue:', error.message);
        });
        
        return true;
      }
    }
    return false;
  }

  /**
   * Clear all queued transactions
   * @param {number} chainId - Optional chain ID to clear specific chain
   */
  clearQueue(chainId = null) {
    if (chainId) {
      this.transactionQueue.set(chainId, []);
      console.log(`  Cleared queue for chain ${chainId}`);
    } else {
      this.transactionQueue.clear();
      console.log('  Cleared all queued transactions');
    }

    this._persistQueue().catch(error => {
      console.error('Failed to persist queue:', error.message);
    });
  }

  /**
   * Persist transaction queue to disk
   * @private
   */
  async _persistQueue() {
    try {
      const queueData = {};
      for (const [chainId, queue] of this.transactionQueue) {
        // Serialize queue with BigInt handling
        queueData[chainId] = queue.map(tx => this._serializeTransaction(tx));
      }

      const data = {
        nextQueueId: this.nextQueueId,
        queues: queueData,
        savedAt: Date.now()
      };

      await fs.writeFile(this.queuePersistencePath, JSON.stringify(data, null, 2));
    } catch (error) {
      // Fail silently - queue persistence is not critical
      console.error('Failed to persist queue:', error.message);
    }
  }

  /**
   * Load transaction queue from disk
   * @private
   */
  async _loadQueue() {
    try {
      const data = await fs.readFile(this.queuePersistencePath, 'utf-8');
      const parsed = JSON.parse(data);

      this.nextQueueId = parsed.nextQueueId || 1;
      
      for (const [chainId, queue] of Object.entries(parsed.queues || {})) {
        // Deserialize queue with BigInt handling
        this.transactionQueue.set(
          parseInt(chainId), 
          queue.map(tx => this._deserializeTransaction(tx))
        );
      }

      const totalQueued = Array.from(this.transactionQueue.values())
        .reduce((sum, queue) => sum + queue.length, 0);

      if (totalQueued > 0) {
        console.log(` Loaded ${totalQueued} queued transactions from disk`);
      }
    } catch (error) {
      // File doesn't exist or is invalid - start with empty queue
      if (error.code !== 'ENOENT') {
        console.error('Failed to load queue:', error.message);
      }
    }
  }

  /**
   * Serialize a transaction for JSON storage (handle BigInt)
   * @private
   */
  _serializeTransaction(tx) {
    const serialized = { ...tx };
    
    // Convert BigInt values to strings
    if (serialized.transaction) {
      serialized.transaction = { ...serialized.transaction };
      if (serialized.transaction.value && typeof serialized.transaction.value === 'bigint') {
        serialized.transaction.value = serialized.transaction.value.toString();
      }
      if (serialized.transaction.gasLimit && typeof serialized.transaction.gasLimit === 'bigint') {
        serialized.transaction.gasLimit = serialized.transaction.gasLimit.toString();
      }
    }
    
    return serialized;
  }

  /**
   * Deserialize a transaction from JSON storage (restore BigInt)
   * @private
   */
  _deserializeTransaction(tx) {
    const deserialized = { ...tx };
    
    // Convert string values back to BigInt
    if (deserialized.transaction) {
      deserialized.transaction = { ...deserialized.transaction };
      if (deserialized.transaction.value && typeof deserialized.transaction.value === 'string') {
        deserialized.transaction.value = BigInt(deserialized.transaction.value);
      }
      if (deserialized.transaction.gasLimit && typeof deserialized.transaction.gasLimit === 'string') {
        deserialized.transaction.gasLimit = BigInt(deserialized.transaction.gasLimit);
      }
    }
    
    return deserialized;
  }

  /**
   * Batch multiple transactions into a single multicall transaction
   * @param {Array} transactions - Array of transaction objects to batch
   * @param {Object} options - Batching options
   * @returns {Object} Batched transaction object
   */
  batchTransactions(transactions, options = {}) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      throw new Error('Transactions must be a non-empty array');
    }

    // Validate all transactions are for the same chain
    const chainId = transactions[0].chainId || this.chainId;
    const invalidChain = transactions.find(tx => (tx.chainId || this.chainId) !== chainId);
    if (invalidChain) {
      throw new Error('All transactions must be for the same chain');
    }

    // Group transactions by type for optimization
    const grouped = this._groupTransactionsByType(transactions);
    
    // Calculate gas savings
    const individualGasEstimate = transactions.reduce((sum, tx) => {
      return sum + (tx.estimatedGas || 0);
    }, 0);
    
    // Batched transactions typically save 21000 gas per tx (base transaction cost)
    const batchedGasEstimate = individualGasEstimate - (transactions.length - 1) * 21000;
    const gasSavings = individualGasEstimate - batchedGasEstimate;
    const savingsPercentage = individualGasEstimate > 0 
      ? (gasSavings / individualGasEstimate) * 100 
      : 0;

    const batchedTx = {
      type: 'batched',
      chainId,
      transactions,
      grouped,
      batchSize: transactions.length,
      estimatedGas: batchedGasEstimate,
      gasSavings,
      savingsPercentage,
      metadata: {
        batchedAt: Date.now(),
        batchStrategy: options.strategy || 'multicall',
        ...options.metadata
      }
    };

    console.log(` Batched ${transactions.length} transactions:`);
    console.log(`   Estimated gas savings: ${gasSavings.toLocaleString()} (${savingsPercentage.toFixed(1)}%)`);
    console.log(`   Individual gas: ${individualGasEstimate.toLocaleString()}`);
    console.log(`   Batched gas: ${batchedGasEstimate.toLocaleString()}`);

    return batchedTx;
  }

  /**
   * Group transactions by type for optimization
   * @private
   */
  _groupTransactionsByType(transactions) {
    const groups = {
      approvals: [],
      supplies: [],
      withdrawals: [],
      borrows: [],
      repays: [],
      swaps: [],
      other: []
    };

    for (const tx of transactions) {
      const type = this._detectTransactionType(tx);
      if (groups[type]) {
        groups[type].push(tx);
      } else {
        groups.other.push(tx);
      }
    }

    // Remove empty groups
    return Object.fromEntries(
      Object.entries(groups).filter(([_, txs]) => txs.length > 0)
    );
  }

  /**
   * Detect transaction type from transaction data
   * @private
   */
  _detectTransactionType(tx) {
    if (!tx.data) return 'other';

    const data = tx.data.toLowerCase();
    
    // Common function signatures (first 4 bytes)
    if (data.startsWith('0x095ea7b3')) return 'approvals';      // approve(address,uint256)
    if (data.startsWith('0x617ba037')) return 'supplies';       // supply(address,uint256,address,uint16)
    if (data.startsWith('0x69328dec')) return 'withdrawals';    // withdraw(address,uint256,address)
    if (data.startsWith('0xa415bcad')) return 'borrows';        // borrow(address,uint256,uint256,uint16,address)
    if (data.startsWith('0x573ade81')) return 'repays';         // repay(address,uint256,uint256,address)
    if (data.startsWith('0x38ed1739') || data.startsWith('0x7c025200')) return 'swaps'; // swapExact...
    
    return 'other';
  }

  /**
   * Optimize multi-step operations into a single transaction
   * @param {Object} operation - Multi-step operation object
   * @returns {Object} Optimized transaction
   */
  optimizeMultiStepOperation(operation) {
    if (!operation || !operation.steps || !Array.isArray(operation.steps)) {
      throw new Error('Invalid operation: must have steps array');
    }

    const { steps, chainId = this.chainId } = operation;

    // Detect common patterns that can be optimized
    const pattern = this._detectOperationPattern(steps);

    let optimizedTx;

    switch (pattern) {
      case 'approve_and_supply':
        optimizedTx = this._optimizeApproveAndSupply(steps, chainId);
        break;
      
      case 'approve_and_swap':
        optimizedTx = this._optimizeApproveAndSwap(steps, chainId);
        break;
      
      case 'withdraw_and_supply':
        optimizedTx = this._optimizeWithdrawAndSupply(steps, chainId);
        break;
      
      case 'multiple_supplies':
        optimizedTx = this._optimizeMultipleSupplies(steps, chainId);
        break;
      
      case 'multiple_withdrawals':
        optimizedTx = this._optimizeMultipleWithdrawals(steps, chainId);
        break;
      
      default:
        // Generic batching for unrecognized patterns
        optimizedTx = this._genericBatchOptimization(steps, chainId);
    }

    console.log(` Optimized ${pattern} operation:`);
    console.log(`   Steps: ${steps.length} → 1`);
    console.log(`   Pattern: ${pattern}`);

    return optimizedTx;
  }

  /**
   * Detect operation pattern from steps
   * @private
   */
  _detectOperationPattern(steps) {
    if (steps.length < 2) return 'single_step';

    const types = steps.map(step => this._detectTransactionType(step));

    // Check for approve + supply pattern
    if (types.length === 2 && types[0] === 'approvals' && types[1] === 'supplies') {
      return 'approve_and_supply';
    }

    // Check for approve + swap pattern
    if (types.length === 2 && types[0] === 'approvals' && types[1] === 'swaps') {
      return 'approve_and_swap';
    }

    // Check for withdraw + supply pattern (rebalancing)
    if (types.length === 2 && types[0] === 'withdrawals' && types[1] === 'supplies') {
      return 'withdraw_and_supply';
    }

    // Check for multiple supplies
    if (types.every(t => t === 'supplies')) {
      return 'multiple_supplies';
    }

    // Check for multiple withdrawals
    if (types.every(t => t === 'withdrawals')) {
      return 'multiple_withdrawals';
    }

    return 'mixed';
  }

  /**
   * Optimize approve + supply into single transaction
   * @private
   */
  _optimizeApproveAndSupply(steps, chainId) {
    // In practice, this would use a multicall contract or protocol-specific batch function
    // For now, we return a batched transaction structure
    return {
      type: 'optimized',
      pattern: 'approve_and_supply',
      chainId,
      originalSteps: steps,
      optimizedSteps: 1,
      estimatedGas: steps.reduce((sum, s) => sum + (s.estimatedGas || 0), 0) * 0.7, // ~30% savings
      gasSavings: steps.reduce((sum, s) => sum + (s.estimatedGas || 0), 0) * 0.3,
      metadata: {
        optimizedAt: Date.now(),
        optimization: 'Combined approve and supply into single multicall'
      }
    };
  }

  /**
   * Optimize approve + swap into single transaction
   * @private
   */
  _optimizeApproveAndSwap(steps, chainId) {
    return {
      type: 'optimized',
      pattern: 'approve_and_swap',
      chainId,
      originalSteps: steps,
      optimizedSteps: 1,
      estimatedGas: steps.reduce((sum, s) => sum + (s.estimatedGas || 0), 0) * 0.75, // ~25% savings
      gasSavings: steps.reduce((sum, s) => sum + (s.estimatedGas || 0), 0) * 0.25,
      metadata: {
        optimizedAt: Date.now(),
        optimization: 'Combined approve and swap using DEX router'
      }
    };
  }

  /**
   * Optimize withdraw + supply (rebalancing) into single transaction
   * @private
   */
  _optimizeWithdrawAndSupply(steps, chainId) {
    return {
      type: 'optimized',
      pattern: 'withdraw_and_supply',
      chainId,
      originalSteps: steps,
      optimizedSteps: 1,
      estimatedGas: steps.reduce((sum, s) => sum + (s.estimatedGas || 0), 0) * 0.65, // ~35% savings
      gasSavings: steps.reduce((sum, s) => sum + (s.estimatedGas || 0), 0) * 0.35,
      metadata: {
        optimizedAt: Date.now(),
        optimization: 'Combined withdraw and supply for atomic rebalancing'
      }
    };
  }

  /**
   * Optimize multiple supplies into single transaction
   * @private
   */
  _optimizeMultipleSupplies(steps, chainId) {
    return {
      type: 'optimized',
      pattern: 'multiple_supplies',
      chainId,
      originalSteps: steps,
      optimizedSteps: 1,
      estimatedGas: steps.reduce((sum, s) => sum + (s.estimatedGas || 0), 0) * 0.6, // ~40% savings
      gasSavings: steps.reduce((sum, s) => sum + (s.estimatedGas || 0), 0) * 0.4,
      metadata: {
        optimizedAt: Date.now(),
        optimization: 'Batched multiple supply operations into multicall'
      }
    };
  }

  /**
   * Optimize multiple withdrawals into single transaction
   * @private
   */
  _optimizeMultipleWithdrawals(steps, chainId) {
    return {
      type: 'optimized',
      pattern: 'multiple_withdrawals',
      chainId,
      originalSteps: steps,
      optimizedSteps: 1,
      estimatedGas: steps.reduce((sum, s) => sum + (s.estimatedGas || 0), 0) * 0.6, // ~40% savings
      gasSavings: steps.reduce((sum, s) => sum + (s.estimatedGas || 0), 0) * 0.4,
      metadata: {
        optimizedAt: Date.now(),
        optimization: 'Batched multiple withdrawal operations into multicall'
      }
    };
  }

  /**
   * Generic batch optimization for mixed operations
   * @private
   */
  _genericBatchOptimization(steps, chainId) {
    return {
      type: 'optimized',
      pattern: 'generic_batch',
      chainId,
      originalSteps: steps,
      optimizedSteps: 1,
      estimatedGas: steps.reduce((sum, s) => sum + (s.estimatedGas || 0), 0) * 0.8, // ~20% savings
      gasSavings: steps.reduce((sum, s) => sum + (s.estimatedGas || 0), 0) * 0.2,
      metadata: {
        optimizedAt: Date.now(),
        optimization: 'Generic multicall batching'
      }
    };
  }

  /**
   * Validate that transactions are compatible for batching
   * @param {Array} transactions - Transactions to validate
   * @returns {Object} Validation result with compatible flag and reasons
   */
  validateBatchCompatibility(transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return {
        compatible: false,
        reasons: ['Transactions must be a non-empty array']
      };
    }

    if (transactions.length === 1) {
      return {
        compatible: false,
        reasons: ['Only one transaction provided - batching not beneficial']
      };
    }

    const reasons = [];

    // Check 1: All transactions must be for the same chain
    const chainIds = new Set(transactions.map(tx => tx.chainId || this.chainId));
    if (chainIds.size > 1) {
      reasons.push(`Transactions span multiple chains: ${Array.from(chainIds).join(', ')}`);
    }

    // Check 2: All transactions must have the same sender
    const senders = new Set(transactions.map(tx => tx.from).filter(Boolean));
    if (senders.size > 1) {
      reasons.push(`Transactions have different senders: ${Array.from(senders).join(', ')}`);
    }

    // Check 3: Transactions should not have dependencies that require specific ordering
    // (This is a simplified check - in practice, would need more sophisticated dependency analysis)
    const hasComplexDependencies = this._checkForComplexDependencies(transactions);
    if (hasComplexDependencies) {
      reasons.push('Transactions have complex dependencies that may require specific ordering');
    }

    // Check 4: All transactions should be standard calls (not contract deployments)
    const hasDeployments = transactions.some(tx => !tx.to);
    if (hasDeployments) {
      reasons.push('Cannot batch contract deployment transactions');
    }

    const compatible = reasons.length === 0;

    return {
      compatible,
      reasons: compatible ? ['All transactions are compatible for batching'] : reasons,
      chainId: chainIds.size === 1 ? Array.from(chainIds)[0] : null,
      batchSize: transactions.length
    };
  }

  /**
   * Check for complex dependencies between transactions
   * @private
   */
  _checkForComplexDependencies(transactions) {
    // Simplified dependency check
    // In a real implementation, would analyze transaction data to detect dependencies
    
    // For now, just check if there are multiple transactions to the same contract
    // that might have state dependencies
    const contractCalls = new Map();
    
    for (const tx of transactions) {
      if (!tx.to) continue;
      
      const count = contractCalls.get(tx.to) || 0;
      contractCalls.set(tx.to, count + 1);
    }

    // If any contract is called more than twice, might have complex dependencies
    for (const count of contractCalls.values()) {
      if (count > 2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate gas savings from batching
   * @param {Array} transactions - Original transactions
   * @param {Object} batchedTransaction - Batched transaction
   * @returns {Object} Gas savings analysis
   */
  calculateBatchGasSavings(transactions, batchedTransaction) {
    const individualGas = transactions.reduce((sum, tx) => {
      return sum + (tx.estimatedGas || 0);
    }, 0);

    const batchedGas = batchedTransaction.estimatedGas || 0;
    const savings = individualGas - batchedGas;
    const savingsPercentage = individualGas > 0 ? (savings / individualGas) * 100 : 0;

    // Calculate cost savings in ETH and USD (if gas price available)
    const currentGasPrice = this.currentGasPrices.get(batchedTransaction.chainId);
    let savingsETH = 0;
    let savingsUSD = 0;

    if (currentGasPrice) {
      const gasPrice = currentGasPrice.type === 'eip1559' 
        ? currentGasPrice.maxFeePerGas 
        : currentGasPrice.gasPrice;
      
      savingsETH = parseFloat(ethers.formatEther(gasPrice * BigInt(Math.floor(savings))));
      
      // Rough ETH price estimate (would need price oracle in production)
      const ethPriceUSD = 2000; // Placeholder
      savingsUSD = savingsETH * ethPriceUSD;
    }

    return {
      individualGas,
      batchedGas,
      gasSavings: savings,
      savingsPercentage,
      savingsETH,
      savingsUSD,
      transactionCount: transactions.length,
      savingsPerTransaction: savings / transactions.length
    };
  }

  /**
   * Calculate cost-benefit analysis for rebalancing operations
   * @param {Object} operation - Rebalancing operation details
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Cost-benefit analysis result
   * 
   * Requirements: 6.4, 6.5, 7.6
   */
  async calculateCostBenefit(operation, options = {}) {
    const {
      currentAPY,
      newAPY,
      positionSizeUSD,
      estimatedGas,
      chainId = this.chainId,
      ethPriceUSD = options.ethPriceUSD || 2000 // Default ETH price, should come from price oracle
    } = operation;

    // Validate inputs
    if (typeof currentAPY !== 'number' || typeof newAPY !== 'number') {
      throw new Error('currentAPY and newAPY must be numbers');
    }
    if (typeof positionSizeUSD !== 'number' || positionSizeUSD <= 0) {
      throw new Error('positionSizeUSD must be a positive number');
    }
    if (typeof estimatedGas !== 'number' || estimatedGas <= 0) {
      throw new Error('estimatedGas must be a positive number');
    }

    // Get current gas price
    const gasPrice = await this.getCurrentGasPrice(chainId);
    
    // Calculate gas cost in ETH
    const gasPriceWei = gasPrice.type === 'eip1559' 
      ? gasPrice.maxFeePerGas 
      : gasPrice.gasPrice;
    
    const gasCostWei = gasPriceWei * BigInt(Math.floor(estimatedGas));
    const gasCostETH = parseFloat(ethers.formatEther(gasCostWei));
    const gasCostUSD = gasCostETH * ethPriceUSD;

    // Calculate gas cost as percentage of transaction value
    const gasCostPercentage = (gasCostUSD / positionSizeUSD) * 100;

    // Requirement 6.7: Adjust gas threshold for L2 networks
    const isL2 = this.isL2Chain(chainId);
    const chainName = CHAIN_CONFIGS[chainId]?.name || `Chain ${chainId}`;
    const adjustedGasThreshold = this.getAdjustedGasThreshold(chainId, 2.0);
    
    // Check if gas cost exceeds adjusted threshold (Requirement 6.5, 6.7)
    const exceedsGasThreshold = gasCostPercentage > adjustedGasThreshold;

    // Calculate APY improvement
    const apyImprovement = newAPY - currentAPY;
    const apyImprovementBps = apyImprovement * 100; // basis points

    // Calculate annual benefit in USD
    const annualBenefitUSD = (positionSizeUSD * apyImprovement) / 100;

    // Calculate daily benefit
    const dailyBenefitUSD = annualBenefitUSD / 365;

    // Calculate break-even time in days (Requirement 7.6)
    const breakEvenDays = dailyBenefitUSD > 0 
      ? gasCostUSD / dailyBenefitUSD 
      : Infinity;

    // Calculate net yield improvement after gas costs
    const netAnnualBenefitUSD = annualBenefitUSD - gasCostUSD;
    const netAPYImprovement = (netAnnualBenefitUSD / positionSizeUSD) * 100;

    // Calculate projected returns over different time horizons
    const projections = {
      '7days': dailyBenefitUSD * 7 - gasCostUSD,
      '30days': dailyBenefitUSD * 30 - gasCostUSD,
      '90days': dailyBenefitUSD * 90 - gasCostUSD,
      '365days': annualBenefitUSD - gasCostUSD
    };

    // Determine recommendation (adjusted for L2)
    let recommendation;
    let shouldExecute;

    if (exceedsGasThreshold) {
      recommendation = `REJECT - Gas cost exceeds ${adjustedGasThreshold.toFixed(1)}% threshold${isL2 ? ' (L2-adjusted)' : ''}`;
      shouldExecute = false;
    } else if (apyImprovement <= 0) {
      recommendation = 'REJECT - No yield improvement';
      shouldExecute = false;
    } else if (breakEvenDays > 365) {
      recommendation = 'REJECT - Break-even time exceeds 1 year';
      shouldExecute = false;
    } else if (breakEvenDays <= 30) {
      recommendation = `EXECUTE - Break-even within 30 days${isL2 ? ' [L2 network]' : ''}`;
      shouldExecute = true;
    } else if (breakEvenDays <= 90) {
      recommendation = `CONSIDER - Break-even within 90 days${isL2 ? ' [L2 network]' : ''}`;
      shouldExecute = true;
    } else {
      recommendation = 'CAUTION - Break-even time is long';
      shouldExecute = false;
    }

    const analysis = {
      // Input parameters
      currentAPY,
      newAPY,
      positionSizeUSD,
      chainId,
      chainName,
      isL2,
      
      // Gas costs
      gasCosts: {
        estimatedGas,
        gasPriceGwei: gasPrice.type === 'eip1559' ? gasPrice.maxFeeGwei : gasPrice.gasPriceGwei,
        gasCostETH,
        gasCostUSD,
        gasCostPercentage,
        adjustedThreshold: adjustedGasThreshold,
        exceedsThreshold: exceedsGasThreshold
      },
      
      // Yield analysis
      yieldAnalysis: {
        apyImprovement,
        apyImprovementBps,
        annualBenefitUSD,
        dailyBenefitUSD,
        netAnnualBenefitUSD,
        netAPYImprovement
      },
      
      // Break-even analysis (Requirement 7.6)
      breakEven: {
        breakEvenDays,
        breakEvenWeeks: breakEvenDays / 7,
        breakEvenMonths: breakEvenDays / 30
      },
      
      // Projections
      projections,
      
      // Decision
      recommendation,
      shouldExecute,
      
      // Metadata
      timestamp: Date.now(),
      gasPrice: gasPrice.type === 'eip1559' ? {
        type: 'eip1559',
        baseFeeGwei: gasPrice.baseFeeGwei,
        maxFeeGwei: gasPrice.maxFeeGwei
      } : {
        type: 'legacy',
        gasPriceGwei: gasPrice.gasPriceGwei
      }
    };

    // Log analysis
    console.log('\n💰 Cost-Benefit Analysis:');
    console.log(`   Chain: ${chainName}${isL2 ? ' (L2)' : ' (L1)'}`);
    console.log(`   Position Size: $${positionSizeUSD.toLocaleString()}`);
    console.log(`   APY: ${currentAPY.toFixed(2)}% → ${newAPY.toFixed(2)}% (+${apyImprovement.toFixed(2)}%)`);
    console.log(`   Gas Cost: ${gasCostETH.toFixed(6)} ETH ($${gasCostUSD.toFixed(2)}) - ${gasCostPercentage.toFixed(2)}% of position`);
    console.log(`   Gas Threshold: ${adjustedGasThreshold.toFixed(1)}%${isL2 ? ' (L2-adjusted)' : ''}`);
    console.log(`   Annual Benefit: $${annualBenefitUSD.toFixed(2)}`);
    console.log(`   Net Annual Benefit: $${netAnnualBenefitUSD.toFixed(2)}`);
    console.log(`   Break-even: ${breakEvenDays === Infinity ? 'Never' : `${breakEvenDays.toFixed(1)} days`}`);
    console.log(`   ${shouldExecute ? '✅' : '❌'} ${recommendation}`);

    return analysis;
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    this.stopMonitoring();
    
    // Persist queue before cleanup
    await this._persistQueue();
    
    this.providers.clear();
    this.currentGasPrices.clear();
    this.gasPriceHistory.clear();
    console.log(' Gas Optimizer cleaned up');
  }
}

export { PRIORITY_LEVELS, L2_CHAINS, L2_THRESHOLD_MULTIPLIERS };
export default GasOptimizer;
