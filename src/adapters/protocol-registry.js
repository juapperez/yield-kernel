/**
 * Protocol Registry
 * 
 * Manages multiple protocol adapters and their configurations.
 * Provides unified access to all supported DeFi protocols.
 * 
 * Requirements: 1.5, 2.1, 2.5
 */

export class ProtocolRegistry {
  constructor() {
    this.protocols = new Map();
    this.contractAddresses = new Map();
    this.abis = new Map();
    this.riskRatings = new Map();
  }

  /**
   * Register a protocol adapter
   * @param {string} name - Protocol name (e.g., 'aave-v3', 'compound-v3')
   * @param {ProtocolAdapter} adapter - Protocol adapter instance
   * @param {Object} metadata - Protocol metadata
   */
  registerProtocol(name, adapter, metadata = {}) {
    if (this.protocols.has(name)) {
      throw new Error(`Protocol '${name}' is already registered`);
    }

    this.protocols.set(name, {
      adapter,
      metadata: {
        displayName: metadata.displayName || name,
        chainId: metadata.chainId || 1,
        riskRating: metadata.riskRating || 'medium',
        tvl: metadata.tvl || 0,
        auditScore: metadata.auditScore || 0,
        launchDate: metadata.launchDate || null,
        isActive: metadata.isActive !== false,
        ...metadata
      },
      registeredAt: Date.now()
    });

    // Store risk rating for quick access
    this.riskRatings.set(name, metadata.riskRating || 'medium');

    console.log(` Registered protocol: ${name}`);
  }

  /**
   * Unregister a protocol adapter
   * @param {string} name - Protocol name
   */
  unregisterProtocol(name) {
    if (!this.protocols.has(name)) {
      throw new Error(`Protocol '${name}' is not registered`);
    }

    this.protocols.delete(name);
    this.riskRatings.delete(name);
    console.log(`  Unregistered protocol: ${name}`);
  }

  /**
   * Get a protocol adapter by name
   * @param {string} name - Protocol name
   * @returns {ProtocolAdapter} Protocol adapter instance
   */
  getProtocol(name) {
    const protocol = this.protocols.get(name);
    if (!protocol) {
      throw new Error(`Protocol '${name}' is not registered`);
    }
    if (!protocol.metadata.isActive) {
      throw new Error(`Protocol '${name}' is not active`);
    }
    return protocol.adapter;
  }

  /**
   * Get all registered protocol names
   * @param {Object} filters - Optional filters
   * @returns {string[]} Array of protocol names
   */
  getProtocolNames(filters = {}) {
    let protocols = Array.from(this.protocols.entries());

    // Apply filters
    if (filters.chainId) {
      protocols = protocols.filter(([_, p]) => p.metadata.chainId === filters.chainId);
    }
    if (filters.riskRating) {
      protocols = protocols.filter(([_, p]) => p.metadata.riskRating === filters.riskRating);
    }
    if (filters.isActive !== undefined) {
      protocols = protocols.filter(([_, p]) => p.metadata.isActive === filters.isActive);
    }

    return protocols.map(([name, _]) => name);
  }

  /**
   * Get all registered protocols with metadata
   * @returns {Array} Array of protocol info objects
   */
  getAllProtocols() {
    return Array.from(this.protocols.entries()).map(([name, protocol]) => ({
      name,
      ...protocol.metadata,
      adapterInfo: protocol.adapter.getInfo()
    }));
  }

  /**
   * Check if a protocol is registered
   * @param {string} name - Protocol name
   * @returns {boolean} True if registered
   */
  hasProtocol(name) {
    return this.protocols.has(name);
  }

  /**
   * Get protocol metadata
   * @param {string} name - Protocol name
   * @returns {Object} Protocol metadata
   */
  getProtocolMetadata(name) {
    const protocol = this.protocols.get(name);
    if (!protocol) {
      throw new Error(`Protocol '${name}' is not registered`);
    }
    return protocol.metadata;
  }

  /**
   * Update protocol metadata
   * @param {string} name - Protocol name
   * @param {Object} updates - Metadata updates
   */
  updateProtocolMetadata(name, updates) {
    const protocol = this.protocols.get(name);
    if (!protocol) {
      throw new Error(`Protocol '${name}' is not registered`);
    }

    protocol.metadata = {
      ...protocol.metadata,
      ...updates
    };

    // Update risk rating cache if changed
    if (updates.riskRating) {
      this.riskRatings.set(name, updates.riskRating);
    }
  }

  /**
   * Register contract addresses for a protocol
   * @param {string} protocolName - Protocol name
   * @param {Object} addresses - Contract addresses map
   */
  registerContractAddresses(protocolName, addresses) {
    if (!this.contractAddresses.has(protocolName)) {
      this.contractAddresses.set(protocolName, {});
    }

    const protocolAddresses = this.contractAddresses.get(protocolName);
    Object.assign(protocolAddresses, addresses);
  }

  /**
   * Get contract addresses for a protocol
   * @param {string} protocolName - Protocol name
   * @returns {Object} Contract addresses map
   */
  getContractAddresses(protocolName) {
    const addresses = this.contractAddresses.get(protocolName);
    if (!addresses) {
      throw new Error(`No contract addresses registered for protocol '${protocolName}'`);
    }
    return addresses;
  }

  /**
   * Get a specific contract address
   * @param {string} protocolName - Protocol name
   * @param {string} contractName - Contract name
   * @returns {string} Contract address
   */
  getContractAddress(protocolName, contractName) {
    const addresses = this.getContractAddresses(protocolName);
    if (!addresses[contractName]) {
      throw new Error(`Contract '${contractName}' not found for protocol '${protocolName}'`);
    }
    return addresses[contractName];
  }

  /**
   * Register ABIs for a protocol
   * @param {string} protocolName - Protocol name
   * @param {Object} abis - ABIs map
   */
  registerABIs(protocolName, abis) {
    if (!this.abis.has(protocolName)) {
      this.abis.set(protocolName, {});
    }

    const protocolABIs = this.abis.get(protocolName);
    Object.assign(protocolABIs, abis);
  }

  /**
   * Get ABIs for a protocol
   * @param {string} protocolName - Protocol name
   * @returns {Object} ABIs map
   */
  getABIs(protocolName) {
    const abis = this.abis.get(protocolName);
    if (!abis) {
      throw new Error(`No ABIs registered for protocol '${protocolName}'`);
    }
    return abis;
  }

  /**
   * Get a specific contract ABI
   * @param {string} protocolName - Protocol name
   * @param {string} contractName - Contract name
   * @returns {Object} Contract ABI
   */
  getABI(protocolName, contractName) {
    const abis = this.getABIs(protocolName);
    if (!abis[contractName]) {
      throw new Error(`ABI for contract '${contractName}' not found for protocol '${protocolName}'`);
    }
    return abis[contractName];
  }

  /**
   * Get risk rating for a protocol
   * @param {string} name - Protocol name
   * @returns {string} Risk rating: 'low' | 'medium' | 'high'
   */
  getRiskRating(name) {
    const rating = this.riskRatings.get(name);
    if (!rating) {
      throw new Error(`Protocol '${name}' is not registered`);
    }
    return rating;
  }

  /**
   * Query positions across all protocols
   * @param {string} userAddress - User's wallet address
   * @param {Object} options - Query options
   * @returns {Promise<Position[]>} Array of positions from all protocols
   */
  async queryAllPositions(userAddress, options = {}) {
    const protocolNames = this.getProtocolNames({
      isActive: true,
      ...options
    });

    const positionPromises = protocolNames.map(async (name) => {
      try {
        const adapter = this.getProtocol(name);
        return await adapter.getPositions(userAddress);
      } catch (error) {
        console.error(`Error querying positions from ${name}:`, error.message);
        return [];
      }
    });

    const positionsArrays = await Promise.all(positionPromises);
    return positionsArrays.flat();
  }

  /**
   * Query yields across all protocols with enhanced error handling
   * @param {Object} options - Query options
   * @param {number} options.maxRetries - Maximum retry attempts per protocol (default: 2)
   * @param {number} options.retryDelay - Delay between retries in ms (default: 1000)
   * @param {boolean} options.includeMetadata - Include success/failure metadata (default: false)
   * @returns {Promise<YieldOpportunity[]|Object>} Array of yield opportunities or object with yields and metadata
   */
  async queryAllYields(options = {}) {
    const {
      maxRetries = 2,
      retryDelay = 1000,
      includeMetadata = false,
      ...filterOptions
    } = options;

    const protocolNames = this.getProtocolNames({
      isActive: true,
      ...filterOptions
    });

    const metadata = {
      totalProtocols: protocolNames.length,
      successfulProtocols: [],
      failedProtocols: [],
      timestamp: Date.now()
    };

    // Query all protocols in parallel with retry logic
    const yieldPromises = protocolNames.map(async (name) => {
      let lastError = null;
      
      // Retry loop for transient failures
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const adapter = this.getProtocol(name);
          const yields = await adapter.getAvailableYields();
          
          // Normalize yield data format
          const normalizedYields = this._normalizeYieldData(yields, name);
          
          // Track success
          metadata.successfulProtocols.push({
            name,
            yieldCount: normalizedYields.length,
            attempt: attempt + 1
          });
          
          return normalizedYields;
        } catch (error) {
          lastError = error;
          
          // Don't retry on final attempt
          if (attempt < maxRetries) {
            const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
            console.warn(`Retry ${attempt + 1}/${maxRetries} for ${name} after ${delay}ms:`, error.message);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // All retries failed
      console.error(`Failed to query yields from ${name} after ${maxRetries + 1} attempts:`, lastError.message);
      metadata.failedProtocols.push({
        name,
        error: lastError.message,
        attempts: maxRetries + 1
      });
      
      return [];
    });

    const yieldsArrays = await Promise.all(yieldPromises);
    const allYields = yieldsArrays.flat();

    // Return with or without metadata based on options
    if (includeMetadata) {
      return {
        yields: allYields,
        metadata: {
          ...metadata,
          totalYields: allYields.length,
          successRate: metadata.successfulProtocols.length / metadata.totalProtocols
        }
      };
    }

    return allYields;
  }

  /**
   * Normalize yield data across different protocols into common format
   * @private
   * @param {Array} yields - Raw yield data from protocol adapter
   * @param {string} protocolName - Name of the protocol
   * @returns {Array} Normalized yield opportunities
   */
  _normalizeYieldData(yields, protocolName) {
    return yields.map(yieldData => {
      // Ensure all required fields are present with defaults
      const normalized = {
        protocol: yieldData.protocol || protocolName,
        asset: yieldData.asset || 'UNKNOWN',
        assetAddress: yieldData.assetAddress || null,
        supplyAPY: this._normalizeAPY(yieldData.supplyAPY),
        borrowAPY: this._normalizeAPY(yieldData.borrowAPY),
        incentiveAPY: this._normalizeAPY(yieldData.incentiveAPY),
        totalAPY: this._normalizeAPY(yieldData.totalAPY),
        liquidity: yieldData.liquidity || '0',
        utilizationRate: this._normalizePercentage(yieldData.utilizationRate),
        risk: yieldData.risk || this.getRiskRating(protocolName),
        chainId: yieldData.chainId || 1,
        timestamp: yieldData.timestamp || Date.now()
      };

      // Calculate totalAPY if not provided
      if (!yieldData.totalAPY && yieldData.supplyAPY !== undefined) {
        normalized.totalAPY = normalized.supplyAPY + normalized.incentiveAPY;
      }

      return normalized;
    });
  }

  /**
   * Normalize APY values to consistent format
   * @private
   * @param {number|string|undefined} apy - APY value to normalize
   * @returns {number} Normalized APY as number
   */
  _normalizeAPY(apy) {
    if (apy === undefined || apy === null) {
      return 0;
    }
    
    const numericAPY = typeof apy === 'string' ? parseFloat(apy) : apy;
    
    // Handle invalid values
    if (isNaN(numericAPY) || !isFinite(numericAPY)) {
      return 0;
    }
    
    // Clamp to reasonable range (-100% to 1000%)
    return Math.max(-100, Math.min(1000, numericAPY));
  }

  /**
   * Normalize percentage values to consistent format
   * @private
   * @param {number|string|undefined} percentage - Percentage value to normalize
   * @returns {number} Normalized percentage as number
   */
  _normalizePercentage(percentage) {
    if (percentage === undefined || percentage === null) {
      return 0;
    }
    
    const numericPercentage = typeof percentage === 'string' ? parseFloat(percentage) : percentage;
    
    // Handle invalid values
    if (isNaN(numericPercentage) || !isFinite(numericPercentage)) {
      return 0;
    }
    
    // Clamp to 0-100 range
    return Math.max(0, Math.min(100, numericPercentage));
  }

  /**
   * Get registry statistics
   * @returns {Object} Registry statistics
   */
  getStats() {
    const protocols = Array.from(this.protocols.values());
    const activeProtocols = protocols.filter(p => p.metadata.isActive);

    return {
      totalProtocols: protocols.length,
      activeProtocols: activeProtocols.length,
      inactiveProtocols: protocols.length - activeProtocols.length,
      protocolsByChain: this._groupByChain(protocols),
      protocolsByRisk: this._groupByRisk(protocols)
    };
  }

  /**
   * Group protocols by chain ID
   * @private
   */
  _groupByChain(protocols) {
    const grouped = {};
    for (const protocol of protocols) {
      const chainId = protocol.metadata.chainId;
      if (!grouped[chainId]) {
        grouped[chainId] = 0;
      }
      grouped[chainId]++;
    }
    return grouped;
  }

  /**
   * Group protocols by risk rating
   * @private
   */
  _groupByRisk(protocols) {
    const grouped = { low: 0, medium: 0, high: 0 };
    for (const protocol of protocols) {
      const risk = protocol.metadata.riskRating;
      if (grouped[risk] !== undefined) {
        grouped[risk]++;
      }
    }
    return grouped;
  }

  /**
   * Clear all registered protocols
   * Useful for testing
   */
  clear() {
    this.protocols.clear();
    this.contractAddresses.clear();
    this.abis.clear();
    this.riskRatings.clear();
  }
}
