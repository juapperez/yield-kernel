/**
 * Example: Protocol Adapter Architecture Usage
 * 
 * This file demonstrates how to use the ProtocolAdapter base class
 * and ProtocolRegistry to manage multiple DeFi protocols.
 */

import { ProtocolAdapter } from './protocol-adapter.js';
import { ProtocolRegistry } from './protocol-registry.js';
import { SparkAdapter } from './spark-adapter.js';

/**
 * Example: Aave V3 Protocol Adapter Implementation
 */
class AaveV3Adapter extends ProtocolAdapter {
  constructor(wallet, chainId = 1) {
    super('aave-v3', wallet, { chainId });
  }

  async initialize() {
    // Register Aave V3 Ethereum Mainnet contracts
    this.registerContract(
      'pool',
      '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      {} // ABI would go here
    );
    
    this.registerContract(
      'dataProvider',
      '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
      {} // ABI would go here
    );

    console.log(` Initialized ${this.name} adapter`);
  }

  async getPositions(userAddress) {
    // Implementation would query actual Aave contracts
    return [
      {
        protocol: this.name,
        asset: 'USDT',
        amount: '1000000000', // 1000 USDT (6 decimals)
        amountUSD: '1000',
        apy: 3.45,
        type: 'supplied',
        timestamp: Date.now()
      }
    ];
  }

  async getAvailableYields() {
    // Implementation would query actual Aave contracts
    return [
      {
        protocol: this.name,
        asset: 'USDT',
        supplyAPY: 3.45,
        borrowAPY: 4.12,
        totalAPY: 3.45,
        liquidity: '125000000',
        utilizationRate: 0.75,
        risk: 'low',
        chainId: this.config.chainId
      }
    ];
  }

  async supply(asset, amount) {
    console.log(`Supplying ${amount} ${asset} to ${this.name}...`);
    // Implementation would execute actual transaction
    return {
      success: true,
      txHash: '0x...',
    };
  }

  async withdraw(asset, amount) {
    console.log(`Withdrawing ${amount} ${asset} from ${this.name}...`);
    return { success: true, txHash: '0x...' };
  }

  async borrow(asset, amount) {
    console.log(`Borrowing ${amount} ${asset} from ${this.name}...`);
    return { success: true, txHash: '0x...' };
  }

  async repay(asset, amount) {
    console.log(`Repaying ${amount} ${asset} to ${this.name}...`);
    return { success: true, txHash: '0x...' };
  }

  async getHealthFactor(userAddress) {
    // Implementation would query actual Aave contracts
    return 2.5;
  }

  async getAPY(asset) {
    return {
      supplyAPY: 3.45,
      borrowAPY: 4.12,
      utilizationRate: 0.75,
      timestamp: Date.now()
    };
  }
}

/**
 * Example: Compound V3 Protocol Adapter Implementation
 */
class CompoundV3Adapter extends ProtocolAdapter {
  constructor(wallet, chainId = 1) {
    super('compound-v3', wallet, { chainId });
  }

  async initialize() {
    // Register Compound V3 contracts
    this.registerContract(
      'comet',
      '0xc3d688B66703497DAA19211EEdff47f25384cdc3', // USDC Comet
      {} // ABI would go here
    );

    console.log(` Initialized ${this.name} adapter`);
  }

  async getPositions(userAddress) {
    return [];
  }

  async getAvailableYields() {
    return [
      {
        protocol: this.name,
        asset: 'USDC',
        supplyAPY: 4.20,
        borrowAPY: 5.10,
        totalAPY: 4.20,
        liquidity: '98000000',
        utilizationRate: 0.80,
        risk: 'low',
        chainId: this.config.chainId
      }
    ];
  }

  async supply(asset, amount) {
    console.log(`Supplying ${amount} ${asset} to ${this.name}...`);
    return { success: true, txHash: '0x...' };
  }

  async withdraw(asset, amount) {
    console.log(`Withdrawing ${amount} ${asset} from ${this.name}...`);
    return { success: true, txHash: '0x...' };
  }

  async borrow(asset, amount) {
    console.log(`Borrowing ${amount} ${asset} from ${this.name}...`);
    return { success: true, txHash: '0x...' };
  }

  async repay(asset, amount) {
    console.log(`Repaying ${amount} ${asset} to ${this.name}...`);
    return { success: true, txHash: '0x...' };
  }

  async getHealthFactor(userAddress) {
    return 3.0;
  }

  async getAPY(asset) {
    return {
      supplyAPY: 4.20,
      borrowAPY: 5.10,
      utilizationRate: 0.80,
      timestamp: Date.now()
    };
  }
}

/**
 * Demo: Using the Protocol Adapter Architecture
 */
async function demo() {
  console.log(' Protocol Adapter Architecture Demo\n');

  // Create registry
  const registry = new ProtocolRegistry();

  // Create mock wallet
  const mockWallet = {
    getAddress: async () => '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    signTransaction: async (tx) => tx
  };

  // Create and register Aave adapter
  const aaveAdapter = new AaveV3Adapter(mockWallet);
  await aaveAdapter.initialize();
  
  registry.registerProtocol('aave-v3', aaveAdapter, {
    displayName: 'Aave V3',
    chainId: 1,
    riskRating: 'low',
    tvl: 5000000000,
    auditScore: 95,
    launchDate: '2022-03-16',
    isActive: true
  });

  // Create and register Compound adapter
  const compoundAdapter = new CompoundV3Adapter(mockWallet);
  await compoundAdapter.initialize();
  
  registry.registerProtocol('compound-v3', compoundAdapter, {
    displayName: 'Compound V3',
    chainId: 1,
    riskRating: 'low',
    tvl: 3000000000,
    auditScore: 90,
    launchDate: '2022-08-26',
    isActive: true
  });

  // Create and register Spark adapter
  const sparkAdapter = new SparkAdapter(mockWallet, {
    chainId: 1,
    rpcUrl: process.env.RPC_URL || 'https://eth.llamarpc.com'
  });
  await sparkAdapter.initialize();
  
  registry.registerProtocol('spark', sparkAdapter, {
    displayName: 'Spark Protocol',
    chainId: 1,
    riskRating: 'low',
    tvl: 2500000000,
    auditScore: 95,
    launchDate: '2023-05-09',
    isActive: true
  });

  console.log('\n Registry Stats:');
  console.log(registry.getStats());

  console.log('\n All Protocols:');
  console.log(registry.getAllProtocols());

  // Query positions across all protocols
  console.log('\n Querying positions across all protocols...');
  const userAddress = await mockWallet.getAddress();
  const positions = await registry.queryAllPositions(userAddress);
  console.log('Positions:', positions);

  // Query yields across all protocols
  console.log('\n Querying yields across all protocols...');
  const yields = await registry.queryAllYields();
  console.log('Yields:', yields);

  // Use a specific protocol
  console.log('\n Using Aave V3 protocol directly...');
  const aave = registry.getProtocol('aave-v3');
  const aaveYields = await aave.getAvailableYields();
  console.log('Aave yields:', aaveYields);

  // Get contract addresses
  console.log('\n Aave V3 contract addresses:');
  console.log('Pool:', aave.getContractAddress('pool'));
  console.log('Data Provider:', aave.getContractAddress('dataProvider'));

  console.log('\n Demo complete!');
}

// Run demo if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demo().catch(console.error);
}

export { AaveV3Adapter, CompoundV3Adapter, demo };
