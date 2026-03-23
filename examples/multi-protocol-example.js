/**
 * Multi-Protocol Integration Example
 * 
 * Demonstrates how to use multiple protocol adapters (Aave V3 and Compound V3)
 * together with the protocol registry for yield optimization.
 */

import { AaveV3Adapter } from '../src/aave-v3-adapter.js';
import { CompoundV3Adapter } from '../src/compound-v3-adapter.js';
import { SparkAdapter } from '../src/spark-adapter.js';
import { ProtocolRegistry } from '../src/protocol-registry.js';
import { ethers } from 'ethers';

/**
 * Mock wallet for demonstration
 */
class MockWallet {
  constructor(privateKey, provider) {
    this.signer = new ethers.Wallet(privateKey, provider);
  }

  async getAddress() {
    return this.signer.address;
  }

  async getSigner() {
    return this.signer;
  }
}

/**
 * Main demonstration function
 */
async function demonstrateMultiProtocol() {
  console.log(' Multi-Protocol DeFi Integration Demo\n');
  console.log('This example shows how to:');
  console.log('  1. Initialize multiple protocol adapters');
  console.log('  2. Register them in a unified registry');
  console.log('  3. Query yields across all protocols');
  console.log('  4. Find the best yield opportunities');
  console.log('  5. Compare protocol features\n');

  try {
    // Setup
    const provider = new ethers.JsonRpcProvider(
      process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo'
    );
    const privateKey = process.env.PRIVATE_KEY || ethers.Wallet.createRandom().privateKey;
    const wallet = new MockWallet(privateKey, provider);
    const userAddress = await wallet.getAddress();

    console.log(` User Address: ${userAddress}\n`);

    // 1. Initialize Protocol Registry
    console.log('1⃣  Initializing Protocol Registry...');
    const registry = new ProtocolRegistry();
    console.log('');

    // 2. Initialize and Register Aave V3
    console.log('2⃣  Setting up Aave V3...');
    const aaveAdapter = new AaveV3Adapter(wallet, {
      chainId: 1,
      rpcUrl: process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo'
    });
    await aaveAdapter.initialize();

    registry.registerProtocol('aave-v3', aaveAdapter, {
      displayName: 'Aave V3',
      chainId: 1,
      riskRating: 'low',
      tvl: 6000000000, // $6B
      auditScore: 98,
      launchDate: '2022-03-16',
      isActive: true
    });
    console.log('');

    // 3. Initialize and Register Compound V3
    console.log('3⃣  Setting up Compound V3...');
    const compoundAdapter = new CompoundV3Adapter(wallet, {
      chainId: 1,
      rpcUrl: process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo'
    });
    await compoundAdapter.initialize();

    registry.registerProtocol('compound-v3', compoundAdapter, {
      displayName: 'Compound V3',
      chainId: 1,
      riskRating: 'low',
      tvl: 3000000000, // $3B
      auditScore: 95,
      launchDate: '2022-08-26',
      isActive: true
    });
    console.log('');

    // 4. Initialize and Register Spark Protocol
    console.log('4⃣  Setting up Spark Protocol...');
    const sparkAdapter = new SparkAdapter(wallet, {
      chainId: 1,
      rpcUrl: process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo'
    });
    await sparkAdapter.initialize();

    registry.registerProtocol('spark', sparkAdapter, {
      displayName: 'Spark Protocol',
      chainId: 1,
      riskRating: 'low',
      tvl: 2500000000, // $2.5B
      auditScore: 95,
      launchDate: '2023-05-09',
      isActive: true
    });
    console.log('');

    // 5. Query All Protocols
    console.log('5⃣  Querying all registered protocols...');
    const allProtocols = registry.getAllProtocols();
    console.log(`   Found ${allProtocols.length} protocols:\n`);
    
    allProtocols.forEach(p => {
      console.log(`    ${p.displayName}`);
      console.log(`      Risk: ${p.riskRating}`);
      console.log(`      TVL: $${(p.tvl / 1e9).toFixed(1)}B`);
      console.log(`      Audit Score: ${p.auditScore}/100`);
      console.log(`      Launch: ${p.launchDate}\n`);
    });

    // 6. Query Yields Across All Protocols
    console.log('6⃣  Querying yields across all protocols...');
    const allYields = await registry.queryAllYields();
    console.log(`   Found ${allYields.length} yield opportunities:\n`);

    // Group by asset
    const yieldsByAsset = {};
    allYields.forEach(y => {
      if (!yieldsByAsset[y.asset]) {
        yieldsByAsset[y.asset] = [];
      }
      yieldsByAsset[y.asset].push(y);
    });

    // Display yields by asset
    Object.entries(yieldsByAsset).forEach(([asset, yields]) => {
      console.log(`    ${asset}:`);
      yields.forEach(y => {
        console.log(`      ${y.protocol.padEnd(15)} Supply: ${y.supplyAPY.toFixed(2)}%  Borrow: ${y.borrowAPY.toFixed(2)}%  Util: ${y.utilizationRate.toFixed(1)}%`);
      });
      console.log('');
    });

    // 7. Find Best Yield Opportunities
    console.log('7⃣  Finding best yield opportunities...');
    const bestSupplyYields = findBestYields(allYields, 'supply');
    const bestBorrowYields = findBestYields(allYields, 'borrow');

    console.log('\n    Best Supply Yields:');
    bestSupplyYields.slice(0, 3).forEach((y, i) => {
      console.log(`      ${i + 1}. ${y.protocol}/${y.asset}: ${y.supplyAPY.toFixed(2)}% APY`);
    });

    console.log('\n    Best Borrow Rates (lowest):');
    bestBorrowYields.slice(0, 3).forEach((y, i) => {
      console.log(`      ${i + 1}. ${y.protocol}/${y.asset}: ${y.borrowAPY.toFixed(2)}% APY`);
    });
    console.log('');

    // 8. Query User Positions Across All Protocols
    console.log('8⃣  Querying user positions across all protocols...');
    const allPositions = await registry.queryAllPositions(userAddress);
    console.log(`   Found ${allPositions.length} positions\n`);

    if (allPositions.length > 0) {
      allPositions.forEach(pos => {
        console.log(`    ${pos.protocol}/${pos.asset}`);
        console.log(`      Type: ${pos.type}`);
        console.log(`      Amount: ${pos.amount}`);
        console.log(`      APY: ${pos.apy.toFixed(2)}%\n`);
      });
    } else {
      console.log('   No positions found for this address\n');
    }

    // 9. Compare Protocol Features
    console.log('9⃣  Protocol Feature Comparison:\n');
    console.log('   Feature                 Aave V3          Spark            Compound V3');
    console.log('   ──────────────────────────────────────────────────────────────────────');
    console.log('   Multi-Asset Supply       Yes            Yes            No (base only)');
    console.log('   Collateral Yield         Yes            Yes            No');
    console.log('   Stable Rate Borrow       Yes            Yes            No');
    console.log('   Flash Loans              Yes            Yes            No');
    console.log('   Isolation Mode           Yes            Yes            No');
    console.log('   E-Mode                   Yes            Yes            No');
    console.log('   Gas Efficiency            Medium         Medium        High');
    console.log('   Simplicity                Complex        Complex       Simple');
    console.log('   Governance              Aave DAO         MakerDAO         Compound DAO\n');

    // 10. Registry Statistics
    console.log(' Registry Statistics:');
    const stats = registry.getStats();
    console.log(`   Total Protocols: ${stats.totalProtocols}`);
    console.log(`   Active Protocols: ${stats.activeProtocols}`);
    console.log(`   Protocols by Risk:`);
    Object.entries(stats.protocolsByRisk).forEach(([risk, count]) => {
      if (count > 0) {
        console.log(`     - ${risk}: ${count}`);
      }
    });
    console.log('');

    console.log(' Multi-protocol integration demo completed!\n');

  } catch (error) {
    console.error(' Demo failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Helper: Find best yields
 */
function findBestYields(yields, type) {
  const sorted = [...yields].sort((a, b) => {
    if (type === 'supply') {
      return b.supplyAPY - a.supplyAPY;
    } else {
      return a.borrowAPY - b.borrowAPY; // Lower is better for borrow
    }
  });
  return sorted;
}

/**
 * Helper: Calculate optimal allocation
 */
function calculateOptimalAllocation(yields, totalAmount, riskTolerance) {
  // Filter by risk tolerance
  const eligible = yields.filter(y => {
    const riskScore = { low: 1, medium: 2, high: 3 }[y.risk];
    return riskScore <= riskTolerance;
  });

  // Sort by APY
  const sorted = eligible.sort((a, b) => b.supplyAPY - a.supplyAPY);

  // Allocate with diversification
  const allocation = [];
  const maxPerProtocol = totalAmount * 0.4; // Max 40% per protocol

  let remaining = totalAmount;
  for (const opportunity of sorted) {
    if (remaining <= 0) break;

    const amount = Math.min(remaining, maxPerProtocol);
    allocation.push({
      protocol: opportunity.protocol,
      asset: opportunity.asset,
      amount,
      apy: opportunity.supplyAPY
    });

    remaining -= amount;
  }

  return allocation;
}

// Run demo
demonstrateMultiProtocol().catch(console.error);
