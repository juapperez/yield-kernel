/**
 * Aave V3 Protocol Adapter - Real Contract Integration
 * 
 * Implements real smart contract interactions with Aave V3 protocol.
 * Supports Ethereum mainnet and L2s (Arbitrum, Optimism).
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7
 */

import { ethers } from 'ethers';
import { ProtocolAdapter } from './protocol-adapter.js';

/**
 * Minimal ABIs for Aave V3 contracts
 * Only includes methods we actually use
 */
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

/**
 * Aave V3 contract addresses by chain
 */
const AAVE_V3_ADDRESSES = {
  // Ethereum Mainnet
  1: {
    Pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    PoolDataProvider: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
    PriceOracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2'
  },
  11155111: {
    Pool: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
    PoolDataProvider: '0x3e9708d80f7B3e43118013075F7e95CE3AB31F31',
    PriceOracle: '0x0000000000000000000000000000000000000000'
  },
  // Arbitrum
  42161: {
    Pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    PoolDataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
    PriceOracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7'
  },
  // Optimism
  10: {
    Pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    PoolDataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
    PriceOracle: '0xD81eb3728a631871a7eBBaD631b5f424909f0c77'
  }
};

/**
 * Common asset addresses by chain
 */
const ASSET_ADDRESSES = {
  1: { // Ethereum
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
  },
  11155111: { // Sepolia
    USDC: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8'
  },
  42161: { // Arbitrum
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f'
  },
  10: { // Optimism
    USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    WETH: '0x4200000000000000000000000000000000000006',
    WBTC: '0x68f180fcCe6836688e9084f035309E29Bf0A2095'
  }
};

/**
 * Aave V3 Protocol Adapter
 * Real smart contract integration using ethers.js
 */
export class AaveV3Adapter extends ProtocolAdapter {
  constructor(wallet, config = {}) {
    const chainId = config.chainId || 1;
    const rpcUrl = config.rpcUrl || process.env.RPC_URL || 'https://ethereum.publicnode.com';

    super('aave-v3', wallet, { chainId, rpcUrl });

    this.provider = null;
    this.poolContract = null;
    this.dataProviderContract = null;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  /**
   * Initialize the adapter with contract instances
   */
  async initialize() {
    try {
      console.log(`[Aave V3] Initializing adapter on chain ${this.config.chainId}`);

      // Create provider
      this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      console.log(`[Aave V3] Provider created: ${this.config.rpcUrl}`);

      // Get contract addresses for this chain
      const addresses = AAVE_V3_ADDRESSES[this.config.chainId];
      if (!addresses) {
        throw new Error(`Aave V3 not supported on chain ${this.config.chainId}`);
      }
      console.log(`[Aave V3] Found addresses for chain ${this.config.chainId}`);

      // Register contracts
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

      console.log(`[Aave V3] Initialized successfully`);
      console.log(`   Pool: ${addresses.Pool}`);
      console.log(`   DataProvider: ${addresses.PoolDataProvider}`);

      return true;
    } catch (error) {
      console.error(`[Aave V3] Failed to initialize:`, error.message);
      throw error;
    }
  }

  /**
   * Get user positions from Aave V3
   * Queries actual on-chain data using PoolDataProvider
   */
  async getPositions(userAddress) {
    try {
      const positions = [];

      // Get all available reserves
      const reserves = await this._retryCall(() =>
        this.dataProviderContract.getAllReservesTokens()
      );

      // Query user data for each reserve
      for (const reserve of reserves) {
        const { symbol, tokenAddress } = reserve;

        try {
          const userData = await this._retryCall(() =>
            this.dataProviderContract.getUserReserveData(tokenAddress, userAddress)
          );

          const {
            currentATokenBalance,
            currentVariableDebt,
            currentStableDebt,
            liquidityRate,
            usageAsCollateralEnabled
          } = userData;

          // Add supplied position if user has balance
          if (currentATokenBalance > 0n) {
            const supplyAPY = Number(liquidityRate) / 1e25; // Convert from ray (1e27) to percentage

            positions.push({
              protocol: this.name,
              asset: symbol,
              assetAddress: tokenAddress,
              amount: currentATokenBalance.toString(),
              amountUSD: '0', // Would need price oracle for USD value
              apy: supplyAPY,
              type: usageAsCollateralEnabled ? 'collateral' : 'supplied',
              timestamp: Date.now()
            });
          }

          // Add borrowed positions
          const totalDebt = currentVariableDebt + currentStableDebt;
          if (totalDebt > 0n) {
            positions.push({
              protocol: this.name,
              asset: symbol,
              assetAddress: tokenAddress,
              amount: totalDebt.toString(),
              amountUSD: '0',
              apy: 0, // Would need to query borrow rate
              type: 'borrowed',
              timestamp: Date.now()
            });
          }
        } catch (error) {
          console.warn(`Warning: Could not fetch data for ${symbol}:`, error.message);
          continue;
        }
      }

      return positions;
    } catch (error) {
      console.error('Error fetching Aave V3 positions:', error.message);
      throw error;
    }
  }

  /**
   * Get available yield opportunities from Aave V3 - USDT only
   */
  async getAvailableYields() {
    try {
      console.log(`[Aave V3] Fetching USDT yield from chain ${this.config.chainId}`);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('RPC timeout')), 5000)
      );

      try {
        // Only fetch USDT reserve data
        const usdtAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

        const reserveData = await Promise.race([
          this._retryCall(() => this.dataProviderContract.getReserveData(usdtAddress), 1),
          timeoutPromise
        ]);

        const {
          totalAToken,
          liquidityRate,
          variableBorrowRate
        } = reserveData;

        const supplyAPY = Number(liquidityRate) / 1e25;
        const borrowAPY = Number(variableBorrowRate) / 1e25;

        const yieldData = {
          protocol: this.name,
          asset: 'USDT',
          assetAddress: usdtAddress,
          supplyAPY,
          borrowAPY,
          incentiveAPY: 0,
          totalAPY: supplyAPY,
          liquidity: totalAToken.toString(),
          utilizationRate: 0,
          risk: 'low',
          chainId: this.config.chainId
        };

        console.log(`[Aave V3] USDT yield: ${supplyAPY.toFixed(2)}% APY (real on-chain data)`);
        return [yieldData];
      } catch (error) {
        console.error('[Aave V3] Error fetching USDT yield:', error.message);
        throw error;
      }
    } catch (error) {
      console.error('[Aave V3] Error in getAvailableYields:', error.message);
      throw error;
    }
  }

  /**
   * Supply assets to Aave V3
   * Executes approve + supply transactions
   */
  async supply(asset, amount) {
    try {
      const assetAddress = this._resolveAssetAddress(asset);
      const userAddress = await this.wallet.getAddress();

      console.log(`\n Supplying ${amount} ${asset} to Aave V3...`);

      // Step 1: Approve Pool to spend tokens
      console.log('Step 1/2: Approving token spend...');
      const approvalTx = await this._approveToken(assetAddress, amount);
      console.log(` Approval confirmed: ${approvalTx.hash}`);

      // Step 2: Supply to pool
      console.log('Step 2/2: Supplying to pool...');
      const poolAddress = this.getContractAddress('pool');

      // Get signer from wallet
      const signer = await this._getSigner();
      const poolWithSigner = this.poolContract.connect(signer);

      // Execute supply transaction
      const tx = await poolWithSigner.supply(
        assetAddress,
        amount,
        userAddress,
        0 // referralCode
      );

      console.log(`⏳ Transaction submitted: ${tx.hash}`);
      console.log('   Waiting for confirmation...');

      const receipt = await tx.wait();

      // Parse events from receipt
      const events = this._parseSupplyEvents(receipt);

      console.log(` Supply successful!`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        events
      };
    } catch (error) {
      console.error(' Supply failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Withdraw assets from Aave V3
   */
  async withdraw(asset, amount) {
    try {
      const assetAddress = this._resolveAssetAddress(asset);
      const userAddress = await this.wallet.getAddress();

      console.log(`\n Withdrawing ${amount} ${asset} from Aave V3...`);

      // Get signer from wallet
      const signer = await this._getSigner();
      const poolWithSigner = this.poolContract.connect(signer);

      // Execute withdraw transaction
      // Use max uint256 to withdraw all if amount is 'max'
      const withdrawAmount = amount === 'max'
        ? ethers.MaxUint256
        : amount;

      const tx = await poolWithSigner.withdraw(
        assetAddress,
        withdrawAmount,
        userAddress
      );

      console.log(`⏳ Transaction submitted: ${tx.hash}`);
      console.log('   Waiting for confirmation...');

      const receipt = await tx.wait();

      // Parse events from receipt
      const events = this._parseWithdrawEvents(receipt);

      console.log(` Withdrawal successful!`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        events
      };
    } catch (error) {
      console.error(' Withdrawal failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Borrow assets from Aave V3
   */
  async borrow(asset, amount) {
    try {
      const assetAddress = this._resolveAssetAddress(asset);
      const userAddress = await this.wallet.getAddress();

      console.log(`\n Borrowing ${amount} ${asset} from Aave V3...`);

      const signer = await this._getSigner();
      const poolWithSigner = this.poolContract.connect(signer);

      // Interest rate mode: 2 = variable rate (most common)
      const interestRateMode = 2;

      const tx = await poolWithSigner.borrow(
        assetAddress,
        amount,
        interestRateMode,
        0, // referralCode
        userAddress
      );

      console.log(`⏳ Transaction submitted: ${tx.hash}`);
      const receipt = await tx.wait();

      const events = this._parseBorrowEvents(receipt);

      console.log(` Borrow successful!`);
      console.log(`   Block: ${receipt.blockNumber}`);

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        events
      };
    } catch (error) {
      console.error(' Borrow failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Repay borrowed assets to Aave V3
   */
  async repay(asset, amount) {
    try {
      const assetAddress = this._resolveAssetAddress(asset);
      const userAddress = await this.wallet.getAddress();

      console.log(`\n Repaying ${amount} ${asset} to Aave V3...`);

      // Approve tokens first
      const approvalTx = await this._approveToken(assetAddress, amount);
      console.log(` Approval confirmed: ${approvalTx.hash}`);

      const signer = await this._getSigner();
      const poolWithSigner = this.poolContract.connect(signer);

      // Interest rate mode: 2 = variable rate
      const interestRateMode = 2;
      const repayAmount = amount === 'max' ? ethers.MaxUint256 : amount;

      const tx = await poolWithSigner.repay(
        assetAddress,
        repayAmount,
        interestRateMode,
        userAddress
      );

      console.log(`⏳ Transaction submitted: ${tx.hash}`);
      const receipt = await tx.wait();

      const events = this._parseRepayEvents(receipt);

      console.log(` Repayment successful!`);
      console.log(`   Block: ${receipt.blockNumber}`);

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        events
      };
    } catch (error) {
      console.error(' Repayment failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get health factor for user's leveraged positions
   */
  async getHealthFactor(userAddress) {
    try {
      const accountData = await this._retryCall(() =>
        this.poolContract.getUserAccountData(userAddress)
      );

      const { healthFactor } = accountData;

      // Health factor is in 1e18 format, convert to decimal
      const hf = Number(healthFactor) / 1e18;

      return hf;
    } catch (error) {
      console.error('Error fetching health factor:', error.message);
      throw error;
    }
  }

  /**
   * Get APY data for a specific asset
   */
  async getAPY(asset) {
    try {
      const assetAddress = this._resolveAssetAddress(asset);

      const reserveData = await this._retryCall(() =>
        this.dataProviderContract.getReserveData(assetAddress)
      );

      const {
        liquidityRate,
        variableBorrowRate,
        totalAToken,
        totalVariableDebt
      } = reserveData;

      const supplyAPY = Number(liquidityRate) / 1e25;
      const borrowAPY = Number(variableBorrowRate) / 1e25;

      // Calculate utilization rate
      const totalLiquidity = totalAToken + totalVariableDebt;
      const utilizationRate = totalLiquidity > 0n
        ? Number(totalVariableDebt * 10000n / totalLiquidity) / 100
        : 0;

      return {
        supplyAPY,
        borrowAPY,
        incentiveAPY: 0,
        utilizationRate,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error fetching APY:', error.message);
      throw error;
    }
  }

  /**
   * Helper: Approve token spending
   */
  async _approveToken(tokenAddress, amount) {
    const poolAddress = this.getContractAddress('pool');
    const signer = await this._getSigner();

    const tokenContract = new ethers.Contract(
      tokenAddress,
      AAVE_V3_ABIS.ERC20,
      signer
    );

    // Check current allowance
    const userAddress = await this.wallet.getAddress();
    const currentAllowance = await tokenContract.allowance(userAddress, poolAddress);

    // Only approve if needed
    if (currentAllowance < amount) {
      const tx = await tokenContract.approve(poolAddress, amount);
      return await tx.wait();
    }

    return { hash: 'already-approved' };
  }

  /**
   * Helper: Get signer from wallet
   */
  async _getSigner() {
    // If wallet has a signer method, use it
    if (typeof this.wallet.getSigner === 'function') {
      return await this.wallet.getSigner();
    }

    // If wallet is already a signer, return it
    if (this.wallet.signTransaction) {
      return this.wallet;
    }

    // Otherwise, create a signer from provider
    // This assumes wallet has a private key or mnemonic
    throw new Error('Wallet does not support signing transactions');
  }

  /**
   * Helper: Resolve asset symbol to address
   */
  _resolveAssetAddress(asset) {
    // If already an address, return it
    if (asset.startsWith('0x') && asset.length === 42) {
      return asset;
    }

    // Look up symbol in asset addresses
    const chainAssets = ASSET_ADDRESSES[this.config.chainId];
    if (!chainAssets) {
      throw new Error(`No asset addresses configured for chain ${this.config.chainId}`);
    }

    const address = chainAssets[asset.toUpperCase()];
    if (!address) {
      throw new Error(`Unknown asset: ${asset}`);
    }

    return address;
  }

  /**
   * Helper: Retry contract calls with exponential backoff
   */
  async _retryCall(fn, retries = this.maxRetries) {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1) throw error;

        const delay = this.retryDelay * Math.pow(2, i);
        console.warn(`Retry ${i + 1}/${retries} after ${delay}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Helper: Parse Supply events from transaction receipt
   */
  _parseSupplyEvents(receipt) {
    const events = [];

    for (const log of receipt.logs) {
      try {
        const parsed = this.poolContract.interface.parseLog({
          topics: log.topics,
          data: log.data
        });

        if (parsed && parsed.name === 'Supply') {
          events.push({
            name: 'Supply',
            reserve: parsed.args.reserve,
            user: parsed.args.user,
            onBehalfOf: parsed.args.onBehalfOf,
            amount: parsed.args.amount.toString()
          });
        }
      } catch (e) {
        // Not a Pool event, skip
        continue;
      }
    }

    return events;
  }

  /**
   * Helper: Parse Withdraw events from transaction receipt
   */
  _parseWithdrawEvents(receipt) {
    const events = [];

    for (const log of receipt.logs) {
      try {
        const parsed = this.poolContract.interface.parseLog({
          topics: log.topics,
          data: log.data
        });

        if (parsed && parsed.name === 'Withdraw') {
          events.push({
            name: 'Withdraw',
            reserve: parsed.args.reserve,
            user: parsed.args.user,
            to: parsed.args.to,
            amount: parsed.args.amount.toString()
          });
        }
      } catch (e) {
        continue;
      }
    }

    return events;
  }

  /**
   * Helper: Parse Borrow events from transaction receipt
   */
  _parseBorrowEvents(receipt) {
    const events = [];

    for (const log of receipt.logs) {
      try {
        const parsed = this.poolContract.interface.parseLog({
          topics: log.topics,
          data: log.data
        });

        if (parsed && parsed.name === 'Borrow') {
          events.push({
            name: 'Borrow',
            reserve: parsed.args.reserve,
            user: parsed.args.user,
            onBehalfOf: parsed.args.onBehalfOf,
            amount: parsed.args.amount.toString(),
            interestRateMode: parsed.args.interestRateMode,
            borrowRate: parsed.args.borrowRate.toString()
          });
        }
      } catch (e) {
        continue;
      }
    }

    return events;
  }

  /**
   * Helper: Parse Repay events from transaction receipt
   */
  _parseRepayEvents(receipt) {
    const events = [];

    for (const log of receipt.logs) {
      try {
        const parsed = this.poolContract.interface.parseLog({
          topics: log.topics,
          data: log.data
        });

        if (parsed && parsed.name === 'Repay') {
          events.push({
            name: 'Repay',
            reserve: parsed.args.reserve,
            user: parsed.args.user,
            repayer: parsed.args.repayer,
            amount: parsed.args.amount.toString(),
            useATokens: parsed.args.useATokens
          });
        }
      } catch (e) {
        continue;
      }
    }

    return events;
  }
}
