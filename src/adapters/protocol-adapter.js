/**
 * Base Protocol Adapter
 * 
 * Provides a unified interface for DeFi protocol interactions.
 * All protocol-specific adapters (Aave, Compound, Spark) extend this base class.
 * 
 * Requirements: 1.5, 2.1, 2.5
 */

export class ProtocolAdapter {
  constructor(name, wallet, config = {}) {
    if (new.target === ProtocolAdapter) {
      throw new Error('ProtocolAdapter is abstract and cannot be instantiated directly');
    }
    
    this.name = name;
    this.wallet = wallet;
    this.config = config;
    this.contracts = {};
    this.abis = {};
  }

  /**
   * Initialize the protocol adapter with contract addresses and ABIs
   * Must be implemented by subclasses
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Get user positions in this protocol
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<Position[]>} Array of positions
   */
  async getPositions(userAddress) {
    throw new Error('getPositions() must be implemented by subclass');
  }

  /**
   * Get available yield opportunities for this protocol
   * @returns {Promise<YieldOpportunity[]>} Array of yield opportunities
   */
  async getAvailableYields() {
    throw new Error('getAvailableYields() must be implemented by subclass');
  }

  /**
   * Supply assets to the protocol
   * @param {string} asset - Asset address or symbol
   * @param {string} amount - Amount to supply (in wei/smallest unit)
   * @returns {Promise<TransactionReceipt>} Transaction receipt
   */
  async supply(asset, amount) {
    throw new Error('supply() must be implemented by subclass');
  }

  /**
   * Withdraw assets from the protocol
   * @param {string} asset - Asset address or symbol
   * @param {string} amount - Amount to withdraw (in wei/smallest unit)
   * @returns {Promise<TransactionReceipt>} Transaction receipt
   */
  async withdraw(asset, amount) {
    throw new Error('withdraw() must be implemented by subclass');
  }

  /**
   * Borrow assets from the protocol
   * @param {string} asset - Asset address or symbol
   * @param {string} amount - Amount to borrow (in wei/smallest unit)
   * @returns {Promise<TransactionReceipt>} Transaction receipt
   */
  async borrow(asset, amount) {
    throw new Error('borrow() must be implemented by subclass');
  }

  /**
   * Repay borrowed assets to the protocol
   * @param {string} asset - Asset address or symbol
   * @param {string} amount - Amount to repay (in wei/smallest unit)
   * @returns {Promise<TransactionReceipt>} Transaction receipt
   */
  async repay(asset, amount) {
    throw new Error('repay() must be implemented by subclass');
  }

  /**
   * Get health factor for leveraged positions
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<number>} Health factor (e.g., 2.5)
   */
  async getHealthFactor(userAddress) {
    throw new Error('getHealthFactor() must be implemented by subclass');
  }

  /**
   * Get protocol-specific APY data for an asset
   * @param {string} asset - Asset address or symbol
   * @returns {Promise<APYData>} APY data including supply and borrow rates
   */
  async getAPY(asset) {
    throw new Error('getAPY() must be implemented by subclass');
  }

  /**
   * Register a contract address and ABI
   * @param {string} name - Contract name (e.g., 'pool', 'dataProvider')
   * @param {string} address - Contract address
   * @param {Object} abi - Contract ABI
   */
  registerContract(name, address, abi) {
    this.contracts[name] = address;
    this.abis[name] = abi;
  }

  /**
   * Get a registered contract address
   * @param {string} name - Contract name
   * @returns {string} Contract address
   */
  getContractAddress(name) {
    if (!this.contracts[name]) {
      throw new Error(`Contract '${name}' not registered for protocol '${this.name}'`);
    }
    return this.contracts[name];
  }

  /**
   * Get a registered contract ABI
   * @param {string} name - Contract name
   * @returns {Object} Contract ABI
   */
  getContractABI(name) {
    if (!this.abis[name]) {
      throw new Error(`ABI for contract '${name}' not registered for protocol '${this.name}'`);
    }
    return this.abis[name];
  }

  /**
   * Get protocol information
   * @returns {Object} Protocol info
   */
  getInfo() {
    return {
      name: this.name,
      contracts: Object.keys(this.contracts),
      config: this.config
    };
  }
}

/**
 * Type definitions for documentation
 * 
 * @typedef {Object} Position
 * @property {string} protocol - Protocol name
 * @property {string} asset - Asset symbol or address
 * @property {string} amount - Position amount
 * @property {string} amountUSD - Position value in USD
 * @property {number} apy - Current APY
 * @property {string} type - Position type: 'supplied' | 'borrowed' | 'collateral'
 * @property {number} [healthFactor] - Health factor for leveraged positions
 * @property {number} timestamp - Position timestamp
 * 
 * @typedef {Object} YieldOpportunity
 * @property {string} protocol - Protocol name
 * @property {string} asset - Asset symbol
 * @property {number} supplyAPY - Supply APY percentage
 * @property {number} borrowAPY - Borrow APY percentage
 * @property {number} [incentiveAPY] - Additional incentive APY
 * @property {number} totalAPY - Total APY including incentives
 * @property {string} liquidity - Available liquidity
 * @property {number} utilizationRate - Protocol utilization rate
 * @property {string} risk - Risk level: 'low' | 'medium' | 'high'
 * @property {number} chainId - Chain ID
 * 
 * @typedef {Object} APYData
 * @property {number} supplyAPY - Supply APY percentage
 * @property {number} borrowAPY - Borrow APY percentage
 * @property {number} [incentiveAPY] - Additional incentive APY
 * @property {number} utilizationRate - Current utilization rate
 * @property {number} timestamp - Data timestamp
 * 
 * @typedef {Object} TransactionReceipt
 * @property {boolean} success - Transaction success status
 * @property {string} txHash - Transaction hash
 * @property {string} [error] - Error message if failed
 */
