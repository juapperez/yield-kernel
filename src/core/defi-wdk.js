import { createLogger } from '../utils/logger.js';
import { createRequire } from 'module';

let AaveProtocolEvm;
try {
  const require = createRequire(import.meta.url);
  const aave = require('@tetherto/wdk-protocol-lending-aave-evm');
  AaveProtocolEvm = aave.default || aave.AaveProtocolEvm;
} catch (error) {
  createLogger({ service: 'yieldkernel-defi-wdk' }).warn('aave.wdk.unavailable', { reason: 'module_not_installed' });
}

export class DeFiManagerWDK {
  constructor(wallet, config = {}) {
    this.wallet = wallet;
    this.log = createLogger({ service: 'yieldkernel-defi-wdk' });
    this.chainId = Number(config.chainId || process.env.CHAIN_ID || 1);
    this.rpcUrl = String(config.rpcUrl || process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo');
    this.initialized = false;
    this.aaveProtocol = null;
    this.account = null;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      if (!this.wallet) throw new Error('Wallet not initialized');
      if (!AaveProtocolEvm) throw new Error('WDK Aave module not available');

      // Get the first account from wallet
      this.account = await this.wallet.getAccount(0);
      
      // Initialize Aave protocol with WDK account
      this.aaveProtocol = new AaveProtocolEvm(this.account);
      
      this.log.info('defi.wdk.initialized', { chainId: this.chainId, rpcUrl: this.rpcUrl });
      this.initialized = true;
    } catch (error) {
      this.log.error('defi.wdk.init.error', { error: { name: error?.name, message: error?.message } });
      throw error;
    }
  }

  async getPortfolio() {
    // Return empty portfolio if not initialized
    if (!this.aaveProtocol) {
      return {
        positions: [],
        totalValue: '0',
        totalCollateral: '0',
        totalDebt: '0',
        availableBorrows: '0',
        liquidationThreshold: '0',
        ltv: '0',
        healthFactor: '0'
      };
    }
    
    try {
      const data = await this.aaveProtocol.getAccountData();
      return {
        totalCollateral: data.totalCollateralBase.toString(),
        totalDebt: data.totalDebtBase.toString(),
        availableBorrows: data.availableBorrowsBase.toString(),
        liquidationThreshold: data.currentLiquidationThreshold.toString(),
        ltv: data.ltv.toString(),
        healthFactor: data.healthFactor.toString()
      };
    } catch (error) {
      this.log.error('portfolio.fetch.error', { error: { name: error?.name, message: error?.message } });
      throw error;
    }
  }

  async getAvailableYields() {
    // Return mock yields even if not fully initialized for demo purposes
    try {
      // Mock yields for now - in production would query Aave data provider
      const yields = [
        {
          protocol: 'aave-v3',
          asset: 'USDT',
          assetAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          supplyAPY: 3.45,
          borrowAPY: 5.2,
          incentiveAPY: 0,
          totalAPY: 3.45,
          liquidity: '1000000000000000000000000',
          utilizationRate: 0.65,
          risk: 'low',
          chainId: this.chainId
        },
        {
          protocol: 'aave-v3',
          asset: 'USDC',
          assetAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          supplyAPY: 3.52,
          borrowAPY: 5.1,
          incentiveAPY: 0,
          totalAPY: 3.52,
          liquidity: '1500000000000000000000000',
          utilizationRate: 0.58,
          risk: 'low',
          chainId: this.chainId
        },
        {
          protocol: 'aave-v3',
          asset: 'DAI',
          assetAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
          supplyAPY: 3.38,
          borrowAPY: 5.0,
          incentiveAPY: 0,
          totalAPY: 3.38,
          liquidity: '800000000000000000000000',
          utilizationRate: 0.62,
          risk: 'low',
          chainId: this.chainId
        }
      ];

      this.log.info('yields.discovered', { count: yields.length });
      return yields;
    } catch (error) {
      this.log.error('yields.fetch.error', { error: { name: error?.name, message: error?.message } });
      return [];
    }
  }

  async supplyToAave(asset, amount) {
    if (!this.aaveProtocol) throw new Error('DeFi manager not initialized');
    
    try {
      const assetAddress = this._resolveAssetAddress(asset);
      const amountBigInt = BigInt(amount);

      // Get quote first
      const quote = await this.aaveProtocol.quoteSupply({ 
        token: assetAddress, 
        amount: amountBigInt 
      });

      this.log.info('supply.quote', { asset, amount, fee: quote.fee.toString() });

      // Execute supply
      const result = await this.aaveProtocol.supply({ 
        token: assetAddress, 
        amount: amountBigInt 
      });

      this.log.info('supply.executed', { asset, amount, hash: result.hash, fee: result.fee.toString() });
      return result;
    } catch (error) {
      this.log.error('supply.error', { asset, amount, error: { name: error?.name, message: error?.message } });
      throw error;
    }
  }

  async withdrawFromAave(asset, amount) {
    if (!this.aaveProtocol) throw new Error('DeFi manager not initialized');
    
    try {
      const assetAddress = this._resolveAssetAddress(asset);
      const amountBigInt = BigInt(amount);

      // Get quote first
      const quote = await this.aaveProtocol.quoteWithdraw({ 
        token: assetAddress, 
        amount: amountBigInt 
      });

      this.log.info('withdraw.quote', { asset, amount, fee: quote.fee.toString() });

      // Execute withdraw
      const result = await this.aaveProtocol.withdraw({ 
        token: assetAddress, 
        amount: amountBigInt 
      });

      this.log.info('withdraw.executed', { asset, amount, hash: result.hash, fee: result.fee.toString() });
      return result;
    } catch (error) {
      this.log.error('withdraw.error', { asset, amount, error: { name: error?.name, message: error?.message } });
      throw error;
    }
  }

  async estimateGas(operation, params = {}) {
    if (!this.aaveProtocol) throw new Error('DeFi manager not initialized');
    
    try {
      const asset = params.asset || 'USDT';
      const amount = BigInt(params.amount || '1000000000'); // 1000 USDT (6 decimals)

      let quote;
      switch (operation) {
        case 'supply':
          quote = await this.aaveProtocol.quoteSupply({ 
            token: this._resolveAssetAddress(asset), 
            amount 
          });
          break;
        case 'withdraw':
          quote = await this.aaveProtocol.quoteWithdraw({ 
            token: this._resolveAssetAddress(asset), 
            amount 
          });
          break;
        case 'borrow':
          quote = await this.aaveProtocol.quoteBorrow({ 
            token: this._resolveAssetAddress(asset), 
            amount 
          });
          break;
        case 'repay':
          quote = await this.aaveProtocol.quoteRepay({ 
            token: this._resolveAssetAddress(asset), 
            amount 
          });
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      // Get current fee rates
      const feeRates = await this.wallet.getFeeRates();

      return {
        operation,
        chainId: this.chainId,
        gasLimit: quote.fee.toString(),
        gasPriceGwei: (Number(feeRates.normal) / 1e9).toFixed(2),
        maxFeePerGasWei: feeRates.normal.toString(),
        maxPriorityFeePerGasWei: '0',
        estimatedCostETH: (Number(quote.fee) / 1e18).toFixed(6),
        estimatedCostUSD: ((Number(quote.fee) / 1e18) * 3000).toFixed(2) // Assume $3000/ETH
      };
    } catch (error) {
      this.log.error('gas.estimate.error', { operation, error: { name: error?.name, message: error?.message } });
      throw error;
    }
  }

  _resolveAssetAddress(asset) {
    const addresses = {
      'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
    };

    if (asset.startsWith('0x') && asset.length === 42) {
      return asset;
    }

    const address = addresses[asset.toUpperCase()];
    if (!address) {
      throw new Error(`Unknown asset: ${asset}`);
    }

    return address;
  }
}
