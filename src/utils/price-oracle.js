/**
 * Price Oracle - Real-time asset pricing with Chainlink integration
 * 
 * Fetches real-time asset prices from Chainlink price feeds with:
 * - Price freshness validation (< 3600 seconds)
 * - Price anomaly detection (>10% deviation check)
 * - 60-second price caching with TTL
 * - Multi-chain support (Ethereum, Arbitrum, Optimism)
 * 
 * Requirements: 3.1, 3.3, 3.5, 3.6
 */

import { ethers } from 'ethers';

/**
 * Chainlink AggregatorV3Interface ABI
 */
const CHAINLINK_AGGREGATOR_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)'
];

/**
 * Uniswap V3 Pool ABI (for TWAP)
 */
const UNISWAP_V3_POOL_ABI = [
  'function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
];

/**
 * Chainlink price feed addresses by chain and asset
 */
const CHAINLINK_FEEDS = {
  // Ethereum Mainnet
  1: {
    ETH_USD: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
    BTC_USD: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
    USDT_USD: '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D',
    USDC_USD: '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
    DAI_USD: '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9',
    WBTC_USD: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c'
  },
  // Arbitrum
  42161: {
    ETH_USD: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
    BTC_USD: '0x6ce185860a4963106506C203335A2910413708e9',
    USDT_USD: '0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7',
    USDC_USD: '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3',
    DAI_USD: '0xc5C8E77B397E531B8EC06BFb0048328B30E9eCfB',
    WBTC_USD: '0x6ce185860a4963106506C203335A2910413708e9'
  },
  // Optimism
  10: {
    ETH_USD: '0x13e3Ee699D1909E989722E753853AE30b17e08c5',
    BTC_USD: '0xD702DD976Fb76Fffc2D3963D037dfDae5b04E593',
    USDT_USD: '0xECef79E109e997bCA29c1c0897ec9d7b03647F5E',
    USDC_USD: '0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3',
    DAI_USD: '0x8dBa75e83DA73cc766A7e5a0ee71F656BAb470d6',
    WBTC_USD: '0xD702DD976Fb76Fffc2D3963D037dfDae5b04E593'
  }
};

/**
 * Asset symbol to feed key mapping
 */
const ASSET_TO_FEED = {
  'ETH': 'ETH_USD',
  'WETH': 'ETH_USD',
  'BTC': 'BTC_USD',
  'WBTC': 'BTC_USD',
  'USDT': 'USDT_USD',
  'USDC': 'USDC_USD',
  'DAI': 'DAI_USD'
};

/**
 * Uniswap V3 pool addresses for TWAP fallback
 * Format: { chainId: { 'TOKEN0_TOKEN1': { pool, token0Decimals, token1Decimals, isToken0Quote } } }
 * Note: In Uniswap V3, token0 < token1 by address, so USDC (lower address) is token0 in ETH/USDC pool
 */
const UNISWAP_V3_POOLS = {
  // Ethereum Mainnet
  1: {
    // ETH/USDC 0.05% pool (USDC is token0, WETH is token1)
    'ETH_USDC': {
      pool: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640',
      token0Decimals: 6,  // USDC
      token1Decimals: 18, // WETH
      isToken0Quote: true // USDC is quote (price in USDC)
    },
    // WBTC/USDC 0.3% pool (WBTC is token0, USDC is token1)
    'WBTC_USDC': {
      pool: '0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35',
      token0Decimals: 8,  // WBTC
      token1Decimals: 6,  // USDC
      isToken0Quote: false // WBTC is base, USDC is quote, we want WBTC price in USDC
    },
    // DAI/USDC 0.01% pool (DAI is token0, USDC is token1)
    'DAI_USDC': {
      pool: '0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168',
      token0Decimals: 18, // DAI
      token1Decimals: 6,  // USDC
      isToken0Quote: false // DAI is base, USDC is quote
    },
    // USDT/USDC 0.01% pool (USDC is token0, USDT is token1)
    'USDT_USDC': {
      pool: '0x3416cF6C708Da44DB2624D63ea0AAef7113527C6',
      token0Decimals: 6,  // USDC
      token1Decimals: 6,  // USDT
      isToken0Quote: true // USDC is quote
    }
  },
  // Arbitrum
  42161: {
    // ETH/USDC 0.05% pool
    'ETH_USDC': {
      pool: '0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443',
      token0Decimals: 6,  // USDC
      token1Decimals: 18, // WETH
      isToken0Quote: true
    },
    // WBTC/USDC 0.05% pool
    'WBTC_USDC': {
      pool: '0x2f5e87C9312fa29aed5c179E456625D79015299c',
      token0Decimals: 6,  // USDC
      token1Decimals: 8,  // WBTC
      isToken0Quote: true
    }
  },
  // Optimism
  10: {
    // ETH/USDC 0.05% pool
    'ETH_USDC': {
      pool: '0x85149247691df622eaF1a8Bd0CaFd40BC45154a9',
      token0Decimals: 6,  // USDC
      token1Decimals: 18, // WETH
      isToken0Quote: true
    }
  }
};

/**
 * Asset to Uniswap pool mapping
 */
const ASSET_TO_UNISWAP_POOL = {
  'ETH': 'ETH_USDC',
  'WETH': 'ETH_USDC',
  'BTC': 'WBTC_USDC',
  'WBTC': 'WBTC_USDC',
  'DAI': 'DAI_USDC',
  'USDT': 'USDT_USDC',
  'USDC': null // USDC is always $1
};

/**
 * Price Oracle class
 */
export class PriceOracle {
  constructor(config = {}) {
    this.chainId = config.chainId || 1;
    this.rpcUrl = config.rpcUrl || process.env.RPC_URL || 'https://ethereum.publicnode.com';
    this.provider = null;
    
    // Price cache with TTL
    this.priceCache = new Map();
    this.cacheTTL = config.cacheTTL || 60000; // 60 seconds
    
    // Price history for anomaly detection
    this.priceHistory = new Map();
    this.maxHistorySize = config.maxHistorySize || 10;
    
    // Configuration
    this.maxPriceAge = config.maxPriceAge || 3600; // 3600 seconds
    this.anomalyThreshold = config.anomalyThreshold || 0.10; // 10%
    
    // Retry configuration
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  /**
   * Initialize the price oracle
   */
  async initialize() {
    try {
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
      
      // Verify provider connection
      const network = await this.provider.getNetwork();
      console.log(` Price Oracle initialized on chain ${network.chainId}`);
      
      return true;
    } catch (error) {
      console.error(' Failed to initialize Price Oracle:', error.message);
      throw error;
    }
  }

  /**
   * Get price for a single asset
   * 
   * @param {string} asset - Asset symbol (e.g., 'ETH', 'USDC')
   * @returns {Promise<Object>} Price data with validation
   */
  async getPrice(asset) {
      try {
        // Check cache first
        const cached = this._getCachedPrice(asset);
        if (cached) {
          console.log(` Using cached price for ${asset}: ${cached.price}`);
          return cached;
        }

        // Try Chainlink first
        try {
          const priceData = await this._fetchChainlinkPrice(asset);

          // Validate price freshness
          this._validateFreshness(priceData, asset);

          // Detect anomalies
          this._detectAnomaly(priceData, asset);

          // Cache the price
          this._cachePrice(asset, priceData);

          // Update price history
          this._updateHistory(asset, priceData);

          console.log(` Fetched price for ${asset}: ${priceData.price} (age: ${priceData.age}s)`);

          return priceData;
        } catch (chainlinkError) {
          // If Chainlink fails or is stale, fall back to Uniswap TWAP
          console.warn(`  Chainlink failed for ${asset}: ${chainlinkError.message}`);
          console.log(` Falling back to Uniswap V3 TWAP...`);

          const twapData = await this.getUniswapTWAP(asset);

          // Cache the TWAP price
          this._cachePrice(asset, twapData);

          // Update price history
          this._updateHistory(asset, twapData);

          console.log(` Fetched TWAP price for ${asset}: ${twapData.price}`);

          return twapData;
        }
      } catch (error) {
        console.error(` Failed to get price for ${asset}:`, error.message);
        throw error;
      }
    }

  /**
   * Get prices for multiple assets
   * 
   * @param {string[]} assets - Array of asset symbols
   * @returns {Promise<Map<string, Object>>} Map of asset to price data
   */
  async getPrices(assets) {
    const prices = new Map();
    
    // Fetch prices in parallel
    const promises = assets.map(async (asset) => {
      try {
        const price = await this.getPrice(asset);
        prices.set(asset, price);
      } catch (error) {
        console.warn(`Warning: Could not fetch price for ${asset}:`, error.message);
        prices.set(asset, null);
      }
    });
    
    await Promise.all(promises);
    
    return prices;
  }
  /**
   * Get Uniswap V3 TWAP price for an asset
   *
   * @param {string} asset - Asset symbol (e.g., 'ETH', 'WBTC')
   * @param {number} twapPeriod - TWAP period in seconds (default: 1800 = 30 minutes)
   * @returns {Promise<Object>} Price data from TWAP
   */
  /**
     * Get Uniswap V3 TWAP price for an asset
     * 
     * @param {string} asset - Asset symbol (e.g., 'ETH', 'WBTC')
     * @param {number} twapPeriod - TWAP period in seconds (default: 1800 = 30 minutes)
     * @returns {Promise<Object>} Price data from TWAP
     */
    /**
       * Get Uniswap V3 TWAP price for an asset
       * 
       * @param {string} asset - Asset symbol (e.g., 'ETH', 'WBTC')
       * @param {number} twapPeriod - TWAP period in seconds (default: 1800 = 30 minutes)
       * @returns {Promise<Object>} Price data from TWAP
       */
      async getUniswapTWAP(asset, twapPeriod = 1800) {
        try {
          // Special case: USDC is always $1
          if (asset.toUpperCase() === 'USDC') {
            return {
              asset,
              price: 1.0,
              timestamp: Math.floor(Date.now() / 1000),
              age: 0,
              source: 'fixed',
              twapPeriod: 0
            };
          }

          // Get pool configuration for this asset
          const poolKey = ASSET_TO_UNISWAP_POOL[asset.toUpperCase()];
          if (!poolKey) {
            throw new Error(`No Uniswap V3 pool configured for asset: ${asset}`);
          }

          const chainPools = UNISWAP_V3_POOLS[this.chainId];
          if (!chainPools) {
            throw new Error(`Uniswap V3 pools not configured for chain: ${this.chainId}`);
          }

          const poolConfig = chainPools[poolKey];
          if (!poolConfig) {
            throw new Error(`No Uniswap V3 pool address for ${asset} on chain ${this.chainId}`);
          }

          // Create pool contract instance
          const pool = new ethers.Contract(
            poolConfig.pool,
            UNISWAP_V3_POOL_ABI,
            this.provider
          );

          // Query TWAP using observe()
          // We need two observations: current and twapPeriod seconds ago
          const secondsAgos = [twapPeriod, 0];

          const observeData = await this._retryCall(async () => {
            return await pool.observe(secondsAgos);
          });

          const tickCumulatives = observeData[0];

          // Calculate average tick over the period
          const tickCumulativeDelta = Number(tickCumulatives[1]) - Number(tickCumulatives[0]);
          const timeWeightedAverageTick = tickCumulativeDelta / twapPeriod;

          // Convert tick to price
          // price = 1.0001 ^ tick
          // This gives us the price of token1 in terms of token0
          const price = Math.pow(1.0001, timeWeightedAverageTick);

          // Adjust for token decimals
          // The raw price needs to be adjusted for decimal differences
          const decimalAdjustment = Math.pow(10, poolConfig.token0Decimals - poolConfig.token1Decimals);
          let adjustedPrice = price * decimalAdjustment;

          // If token0 is the quote currency (e.g., USDC in USDC/WETH pool)
          // The price from the pool is already WETH/USDC, but we want WETH price in USDC
          // So we need to invert it
          if (poolConfig.isToken0Quote) {
            adjustedPrice = 1 / adjustedPrice;
          }

          const timestamp = Math.floor(Date.now() / 1000);

          return {
            asset,
            price: adjustedPrice,
            timestamp,
            age: 0, // TWAP is current
            source: 'uniswap_v3_twap',
            poolAddress: poolConfig.pool,
            twapPeriod
          };
        } catch (error) {
          console.error(` Failed to get Uniswap TWAP for ${asset}:`, error.message);
          throw error;
        }
      }

  /**
   * Fetch price from Chainlink price feed
   * 
   * @private
   * @param {string} asset - Asset symbol
   * @returns {Promise<Object>} Price data
   */
  async _fetchChainlinkPrice(asset) {
    // Get feed address for this asset and chain
    const feedAddress = this._getFeedAddress(asset);
    
    // Create contract instance
    const aggregator = new ethers.Contract(
      feedAddress,
      CHAINLINK_AGGREGATOR_ABI,
      this.provider
    );

    // Fetch latest round data with retry
    const roundData = await this._retryCall(async () => {
      return await aggregator.latestRoundData();
    });

    const decimals = await this._retryCall(async () => {
      return await aggregator.decimals();
    });

    // Parse data
    const { roundId, answer, updatedAt } = roundData;
    const price = Number(answer) / Math.pow(10, Number(decimals));
    const timestamp = Number(updatedAt);
    const age = Math.floor(Date.now() / 1000) - timestamp;

    return {
      asset,
      price,
      timestamp,
      age,
      roundId: roundId.toString(),
      source: 'chainlink',
      feedAddress
    };
  }

  /**
   * Get Chainlink feed address for asset
   * 
   * @private
   * @param {string} asset - Asset symbol
   * @returns {string} Feed address
   */
  _getFeedAddress(asset) {
    const feedKey = ASSET_TO_FEED[asset.toUpperCase()];
    if (!feedKey) {
      throw new Error(`No Chainlink feed configured for asset: ${asset}`);
    }

    const chainFeeds = CHAINLINK_FEEDS[this.chainId];
    if (!chainFeeds) {
      throw new Error(`Chainlink feeds not configured for chain: ${this.chainId}`);
    }

    const feedAddress = chainFeeds[feedKey];
    if (!feedAddress) {
      throw new Error(`No Chainlink feed address for ${asset} on chain ${this.chainId}`);
    }

    return feedAddress;
  }

  /**
   * Validate price freshness
   * 
   * @private
   * @param {Object} priceData - Price data
   * @param {string} asset - Asset symbol
   * @throws {Error} If price is stale
   */
  _validateFreshness(priceData, asset) {
    if (priceData.age > this.maxPriceAge) {
      throw new Error(
        `Price for ${asset} is stale (${priceData.age}s old, max ${this.maxPriceAge}s)`
      );
    }
  }

  /**
   * Detect price anomalies
   * 
   * @private
   * @param {Object} priceData - Price data
   * @param {string} asset - Asset symbol
   * @throws {Error} If anomaly detected
   */
  _detectAnomaly(priceData, asset) {
    const history = this.priceHistory.get(asset);
    if (!history || history.length < 3) {
      // Not enough history for anomaly detection
      return;
    }

    // Calculate moving average
    const movingAverage = history.reduce((sum, p) => sum + p.price, 0) / history.length;
    
    // Calculate deviation
    const deviation = Math.abs(priceData.price - movingAverage) / movingAverage;
    
    if (deviation > this.anomalyThreshold) {
      throw new Error(
        `Price anomaly detected for ${asset}: ${(deviation * 100).toFixed(2)}% deviation from moving average (threshold: ${(this.anomalyThreshold * 100).toFixed(0)}%)`
      );
    }
  }

  /**
   * Cache price with TTL
   * 
   * @private
   * @param {string} asset - Asset symbol
   * @param {Object} priceData - Price data
   */
  _cachePrice(asset, priceData) {
    this.priceCache.set(asset, {
      ...priceData,
      cachedAt: Date.now()
    });
  }

  /**
   * Get cached price if valid
   * 
   * @private
   * @param {string} asset - Asset symbol
   * @returns {Object|null} Cached price or null
   */
  _getCachedPrice(asset) {
    const cached = this.priceCache.get(asset);
    if (!cached) {
      return null;
    }

    const age = Date.now() - cached.cachedAt;
    if (age > this.cacheTTL) {
      // Cache expired
      this.priceCache.delete(asset);
      return null;
    }

    return cached;
  }

  /**
   * Update price history for anomaly detection
   * 
   * @private
   * @param {string} asset - Asset symbol
   * @param {Object} priceData - Price data
   */
  _updateHistory(asset, priceData) {
    let history = this.priceHistory.get(asset);
    if (!history) {
      history = [];
      this.priceHistory.set(asset, history);
    }

    history.push({
      price: priceData.price,
      timestamp: priceData.timestamp
    });

    // Limit history size
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Invalidate cache for asset or all assets
   * 
   * @param {string} [asset] - Asset symbol (optional, clears all if not provided)
   */
  invalidateCache(asset) {
    if (asset) {
      this.priceCache.delete(asset);
      console.log(`  Invalidated cache for ${asset}`);
    } else {
      this.priceCache.clear();
      console.log('  Invalidated all price cache');
    }
  }

  /**
   * Get cache statistics
   * 
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    const stats = {
      size: this.priceCache.size,
      assets: Array.from(this.priceCache.keys()),
      ttl: this.cacheTTL
    };

    return stats;
  }

  /**
   * Get price history for asset
   * 
   * @param {string} asset - Asset symbol
   * @returns {Array} Price history
   */
  getHistory(asset) {
    return this.priceHistory.get(asset) || [];
  }

  /**
   * Retry helper for contract calls
   * 
   * @private
   * @param {Function} fn - Function to retry
   * @returns {Promise<any>} Result
   */
  async _retryCall(fn) {
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === this.maxRetries - 1) {
          throw error;
        }
        
        const delay = this.retryDelay * Math.pow(2, i);
        console.warn(`Retry ${i + 1}/${this.maxRetries} after ${delay}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Get supported assets for current chain
   * 
   * @returns {string[]} Array of supported asset symbols
   */
  getSupportedAssets() {
    const chainFeeds = CHAINLINK_FEEDS[this.chainId];
    if (!chainFeeds) {
      return [];
    }

    // Get unique asset symbols
    const assets = new Set();
    for (const [symbol, feedKey] of Object.entries(ASSET_TO_FEED)) {
      if (chainFeeds[feedKey]) {
        assets.add(symbol);
      }
    }

    return Array.from(assets);
  }

  /**
   * Switch to different chain
   * 
   * @param {number} chainId - Chain ID
   * @param {string} rpcUrl - RPC URL for the chain
   */
  async switchChain(chainId, rpcUrl) {
    this.chainId = chainId;
    this.rpcUrl = rpcUrl;
    
    // Clear cache when switching chains
    this.invalidateCache();
    this.priceHistory.clear();
    
    // Reinitialize provider
    await this.initialize();
    
    console.log(` Switched to chain ${chainId}`);
  }
}
