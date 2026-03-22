/**
 * Real Aave V3 Integration Example
 * 
 * Demonstrates how to use the AaveV3Adapter with real contract calls.
 * This example shows read-only operations that don't require gas.
 */

import { AaveV3Adapter } from '../src/aave-v3-adapter.js';
import { ProtocolRegistry } from '../src/protocol-registry.js';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log(' Aave V3 Real Integration Example\n');

  // Setup provider and wallet
  const rpcUrl = process.env.RPC_URL || 'https://eth.llamarpc.com';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  // For read-only operations, we can use a random wallet
  // For write operations, you would use your actual wallet with private key
  const randomWallet = ethers.Wallet.createRandom().connect(provider);
  
  console.log(` Using wallet: ${randomWallet.address}`);
  console.log(` RPC URL: ${rpcUrl}\n`);

  // Create and initialize adapter
  console.log('Initializing Aave V3 adapter...');
  const adapter = new AaveV3Adapter(randomWallet, {
    chainId: 1,
    rpcUrl
  });
  
  await adapter.initialize();
  console.log(' Adapter initialized\n');

  // Example 1: Get available yields
  console.log(' Example 1: Fetching available yields...');
  try {
    const yields = await adapter.getAvailableYields();
    console.log(`Found ${yields.length} yield opportunities\n`);
    
    // Show top 5 by supply APY
    const topYields = yields
      .sort((a, b) => b.supplyAPY - a.supplyAPY)
      .slice(0, 5);
    
    console.log('Top 5 yields by supply APY:');
    topYields.forEach((y, i) => {
      console.log(`${i + 1}. ${y.asset}: ${y.supplyAPY.toFixed(2)}% supply, ${y.borrowAPY.toFixed(2)}% borrow`);
    });
    console.log();
  } catch (error) {
    console.error('Error fetching yields:', error.message);
  }

  // Example 2: Get specific asset APY
  console.log(' Example 2: Getting USDC APY...');
  try {
    const usdcAPY = await adapter.getAPY('USDC');
    console.log('USDC APY Data:');
    console.log(`  Supply APY: ${usdcAPY.supplyAPY.toFixed(2)}%`);
    console.log(`  Borrow APY: ${usdcAPY.borrowAPY.toFixed(2)}%`);
    console.log(`  Utilization: ${usdcAPY.utilizationRate.toFixed(2)}%`);
    console.log();
  } catch (error) {
    console.error('Error fetching USDC APY:', error.message);
  }

  // Example 3: Query a real user's positions (Vitalik's address as example)
  console.log(' Example 3: Querying positions for a real address...');
  const vitalikAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  try {
    const positions = await adapter.getPositions(vitalikAddress);
    
    if (positions.length > 0) {
      console.log(`Found ${positions.length} positions:`);
      positions.forEach(pos => {
        console.log(`  ${pos.asset}: ${ethers.formatUnits(pos.amount, 18)} (${pos.type})`);
      });
    } else {
      console.log('No positions found for this address');
    }
    console.log();
  } catch (error) {
    console.error('Error fetching positions:', error.message);
  }

  // Example 4: Get health factor
  console.log(' Example 4: Getting health factor...');
  try {
    const healthFactor = await adapter.getHealthFactor(vitalikAddress);
    console.log(`Health Factor: ${healthFactor.toFixed(2)}`);
    
    if (healthFactor === Infinity || healthFactor > 100) {
      console.log('Status: No debt (infinite health factor)');
    } else if (healthFactor > 2.0) {
      console.log('Status: Safe');
    } else if (healthFactor > 1.5) {
      console.log('Status: Moderate risk');
    } else if (healthFactor > 1.0) {
      console.log('Status: High risk');
    } else {
      console.log('Status: At risk of liquidation!');
    }
    console.log();
  } catch (error) {
    console.error('Error fetching health factor:', error.message);
  }

  // Example 5: Using with Protocol Registry
  console.log('  Example 5: Using with Protocol Registry...');
  const registry = new ProtocolRegistry();
  
  registry.registerProtocol('aave-v3', adapter, {
    displayName: 'Aave V3',
    chainId: 1,
    riskRating: 'low',
    tvl: 5000000000,
    auditScore: 95,
    isActive: true
  });
  
  console.log('Registry stats:', registry.getStats());
  console.log();

  // Example 6: Contract addresses
  console.log(' Example 6: Contract addresses...');
  console.log('Pool:', adapter.getContractAddress('pool'));
  console.log('DataProvider:', adapter.getContractAddress('dataProvider'));
  console.log();

  console.log(' All examples completed!');
  console.log('\n Note: To execute write operations (supply, withdraw, borrow, repay),');
  console.log('   you need to use a wallet with a real private key and sufficient balance.');
}

main().catch(console.error);
