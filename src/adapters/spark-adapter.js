/**
 * Spark Protocol Adapter - Aave V3 Fork Integration
 * 
 * Spark Protocol is a fork of Aave V3, so this adapter reuses Aave V3 logic
 * with Spark-specific contract addresses.
 * 
 * Supported chains: Ethereum mainnet, Gnosis Chain
 * 
 * Requirements: 2.1, 2.4
 */

import { AaveV3Adapter } from './aave-v3-adapter.js';

/**
 * Spark Protocol contract addresses by chain
 */
const SPARK_ADDRESSES = {
  // Ethereum Mainnet
  1: {
    Pool: '0xC13e21B648A5Ee794902342038FF3aDAB66BE987',
    PoolDataProvider: '0xFc21d6d146E6086B8359705C8b28512a983db0cb',
    PriceOracle: '0x8105f69D9C41644c6A0803fDA7D03Aa70996cFD9'
  },
  // Gnosis Chain
  100: {
    Pool: '0x2Dae5307c5E3FD1CF5A72Cb6F698f915860607e0',
    PoolDataProvider: '0x2a002054A06546bB5a264D57A81347e23Af91D18',
    PriceOracle: '0x8105f69D9C41644c6A0803fDA7D03Aa70996cFD9'
  }
};

/**
 * Common asset addresses by chain for Spark Protocol
 */
const SPARK_ASSET_ADDRESSES = {
  1: { // Ethereum
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    wstETH: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    rETH: '0xae78736Cd615f374D3085123A210448E74Fc6393'
  },
  100: { // Gnosis Chain
    USDC: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
    WXDAI: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d',
    WETH: '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1',
    GNO: '0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb',
    wstETH: '0x6C76971f98945AE98dD7d4DFcA8711ebea946eA6'
  }
};

/**
 * Spark Protocol Adapter
 * Extends AaveV3Adapter since Spark is an Aave V3 fork
 */
export class SparkAdapter extends AaveV3Adapter {
  constructor(wallet, config = {}) {
    // Call parent constructor with spark-specific name
    super(wallet, config);
    
    // Override protocol name
    this.name = 'spark';
    
    // Store Spark-specific addresses
    this.sparkAddresses = SPARK_ADDRESSES;
    this.sparkAssetAddresses = SPARK_ASSET_ADDRESSES;
  }

  /**
   * Initialize the adapter with Spark contract instances
   * Overrides parent to use Spark addresses
   */
  async initialize() {
    try {
      const { ethers } = await import('ethers');
      
      // Create provider
      this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      
      // Get Spark contract addresses for this chain
      const addresses = this.sparkAddresses[this.config.chainId];
      if (!addresses) {
        throw new Error(`Spark Protocol not supported on chain ${this.config.chainId}`);
      }

      // Import ABIs from parent class
      // We can reuse Aave V3 ABIs since Spark is a fork
      const AAVE_V3_ABIS = {
        Pool: [
          'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
          'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
          'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
          'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)',
          'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
          'event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)',
          'event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)',
          'event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)',
          'event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)'
        ],
        PoolDataProvider: [
          'function getUserReserveData(address asset, address user) view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)',
          'function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)',
          'function getAllReservesTokens() view returns (tuple(string symbol, address tokenAddress)[])',
          'function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)'
        ],
        ERC20: [
          'function approve(address spender, uint256 amount) returns (bool)',
          'function allowance(address owner, address spender) view returns (uint256)',
          'function balanceOf(address account) view returns (uint256)',
          'function decimals() view returns (uint8)',
          'function symbol() view returns (string)'
        ]
      };

      // Register contracts with Spark addresses
      this.registerContract('pool', addresses.Pool, AAVE_V3_ABIS.Pool);
      this.registerContract('dataProvider', addresses.PoolDataProvider, AAVE_V3_ABIS.PoolDataProvider);
      this.registerContract('priceOracle', addresses.PriceOracle, []);

      // Create contract instances
      this.poolContract = new ethers.Contract(
        addresses.Pool,
        AAVE_V3_ABIS.Pool,
        this.provider
      );

      this.dataProviderContract = new ethers.Contract(
        addresses.PoolDataProvider,
        AAVE_V3_ABIS.PoolDataProvider,
        this.provider
      );

      console.log(` Initialized Spark Protocol adapter on chain ${this.config.chainId}`);
      console.log(`   Pool: ${addresses.Pool}`);
      console.log(`   DataProvider: ${addresses.PoolDataProvider}`);
      
      return true;
    } catch (error) {
      console.error(' Failed to initialize Spark Protocol adapter:', error.message);
      throw error;
    }
  }

  /**
   * Override asset address resolution to use Spark-specific addresses
   */
  _resolveAssetAddress(asset) {
    // If already an address, return it
    if (asset.startsWith('0x') && asset.length === 42) {
      return asset;
    }
    
    // Look up symbol in Spark asset addresses
    const chainAssets = this.sparkAssetAddresses[this.config.chainId];
    if (!chainAssets) {
      throw new Error(`No asset addresses configured for Spark on chain ${this.config.chainId}`);
    }
    
    const address = chainAssets[asset.toUpperCase()];
    if (!address) {
      throw new Error(`Unknown asset for Spark Protocol: ${asset}`);
    }
    
    return address;
  }

  /**
   * Get protocol information
   * Overrides parent to return Spark-specific info
   */
  getInfo() {
    return {
      name: this.name,
      displayName: 'Spark Protocol',
      type: 'lending',
      baseProtocol: 'aave-v3-fork',
      contracts: Object.keys(this.contracts),
      config: this.config,
      supportedChains: Object.keys(this.sparkAddresses).map(Number),
      supportedAssets: this.sparkAssetAddresses[this.config.chainId] 
        ? Object.keys(this.sparkAssetAddresses[this.config.chainId])
        : []
    };
  }
}
