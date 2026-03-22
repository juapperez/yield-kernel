/**
 * Example: Parallel Yield Discovery with Enhanced Error Handling
 * 
 * Demonstrates Task 2.3 implementation:
 * - Querying multiple protocols concurrently
 * - Normalized yield data format
 * - Graceful handling of protocol failures
 * - Retry logic for transient errors
 * - Success/failure metadata tracking
 */

import { ProtocolRegistry } from '../src/protocol-registry.js';
import { AaveV3Adapter } from '../src/aave-v3-adapter.js';
import { CompoundV3Adapter } from '../src/compound-v3-adapter.js';
import { SparkAdapter } from '../src/spark-adapter.js';

// Mock wallet for example
const mockWallet = {
  getAddress: async () => '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  getSigner: async () => mockWallet,
  signTransaction: true
};

async function demonstrateParallelYieldDiscovery() {
  console.log(' Parallel Yield Discovery Example\n');
  
  // Initialize protocol registry
  const registry = new ProtocolRegistry();
  
  // Register multiple protocols
  console.log(' Registering protocols...');
  
  const aaveAdapter = new AaveV3Adapter(mockWallet, {
    chainId: 1,
    rpcUrl: process.env.RPC_URL || 'https://eth.llamarpc.com'
  });
  await aaveAdapter.initialize();
  registry.registerProtocol('aave-v3', aaveAdapter, {
    displayName: 'Aave V3',
    riskRating: 'low',
    isActive: true
  });
  
  const compoundAdapter = new CompoundV3Adapter(mockWallet, {
    chainId: 1,
    rpcUrl: process.env.RPC_URL || 'https://eth.llamarpc.com'
  });
  await compoundAdapter.initialize();
  registry.registerProtocol('compound-v3', compoundAdapter, {
    displayName: 'Compound V3',
    riskRating: 'low',
    isActive: true
  });
  
  const sparkAdapter = new SparkAdapter(mockWallet, {
    chainId: 1,
    rpcUrl: process.env.RPC_URL || 'https://eth.llamarpc.com'
  });
  await sparkAdapter.initialize();
  registry.registerProtocol('spark', sparkAdapter, {
    displayName: 'Spark Protocol',
    riskRating: 'low',
    isActive: true
  });
  
  console.log(' Registered 3 protocols\n');
  
  // Example 1: Basic parallel query
  console.log('Example 1: Basic Parallel Query');
  console.log('─'.repeat(50));
  
  const yields = await registry.queryAllYields();
  
  console.log(`Found ${yields.length} yield opportunities across all protocols`);
  console.log('\nTop 5 yields by APY:');
  
  const topYields = yields
    .sort((a, b) => b.totalAPY - a.totalAPY)
    .slice(0, 5);
  
  topYields.forEach((y, i) => {
    console.log(`${i + 1}. ${y.protocol} - ${y.asset}: ${y.totalAPY.toFixed(2)}% APY`);
  });
  
  // Example 2: Query with metadata
  console.log('\n\nExample 2: Query with Metadata');
  console.log('─'.repeat(50));
  
  const result = await registry.queryAllYields({
    includeMetadata: true,
    maxRetries: 3,
    retryDelay: 500
  });
  
  console.log(`Total yields: ${result.yields.length}`);
  console.log(`Success rate: ${(result.metadata.successRate * 100).toFixed(1)}%`);
  console.log(`Successful protocols: ${result.metadata.successfulProtocols.length}`);
  console.log(`Failed protocols: ${result.metadata.failedProtocols.length}`);
  
  // Example 3: Filter by protocol
  console.log('\n\nExample 3: Filter by Chain');
  console.log('─'.repeat(50));
  
  const ethereumYields = await registry.queryAllYields({
    chainId: 1
  });
  
  console.log(`Found ${ethereumYields.length} yields on Ethereum mainnet`);
  
  // Example 4: Normalized data format
  console.log('\n\nExample 4: Normalized Data Format');
  console.log('─'.repeat(50));
  
  if (yields.length > 0) {
    const sample = yields[0];
    console.log('All yields have consistent format:');
    console.log(JSON.stringify(sample, null, 2));
  }
  
  console.log('\n Examples complete!\n');
}

// Run example
demonstrateParallelYieldDiscovery().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
