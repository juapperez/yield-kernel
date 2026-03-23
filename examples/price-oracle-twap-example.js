/**
 * Price Oracle TWAP Fallback Example
 * 
 * Demonstrates:
 * - Fetching prices from Chainlink
 * - Automatic fallback to Uniswap V3 TWAP when Chainlink is stale
 * - Direct TWAP price queries
 * - 30-minute TWAP calculation
 */

import { PriceOracle } from '../src/price-oracle.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('\n Price Oracle TWAP Fallback Example');
  console.log('='.repeat(60));
  
  // Initialize Price Oracle
  const oracle = new PriceOracle({
    chainId: 1, // Ethereum mainnet
    rpcUrl: process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
    cacheTTL: 60000, // 60 seconds
    maxPriceAge: 3600 // 1 hour
  });
  
  await oracle.initialize();
  console.log(' Price Oracle initialized\n');
  
  // Example 1: Normal price fetch (uses Chainlink)
  console.log(' Example 1: Normal Price Fetch (Chainlink)');
  console.log('-'.repeat(60));
  
  const ethPrice = await oracle.getPrice('ETH');
  console.log(`Asset: ${ethPrice.asset}`);
  console.log(`Price: $${ethPrice.price.toFixed(2)}`);
  console.log(`Source: ${ethPrice.source}`);
  console.log(`Age: ${ethPrice.age}s`);
  console.log(`Feed: ${ethPrice.feedAddress}\n`);
  
  // Example 2: Direct TWAP query
  console.log(' Example 2: Direct Uniswap V3 TWAP Query');
  console.log('-'.repeat(60));
  
  const ethTWAP = await oracle.getUniswapTWAP('ETH', 1800); // 30-minute TWAP
  console.log(`Asset: ${ethTWAP.asset}`);
  console.log(`Price: $${ethTWAP.price.toFixed(2)}`);
  console.log(`Source: ${ethTWAP.source}`);
  console.log(`TWAP Period: ${ethTWAP.twapPeriod}s (${ethTWAP.twapPeriod / 60} minutes)`);
  console.log(`Pool: ${ethTWAP.poolAddress}\n`);
  
  // Example 3: Automatic fallback when Chainlink is stale
  console.log(' Example 3: Automatic Fallback (Stale Chainlink)');
  console.log('-'.repeat(60));
  
  // Create oracle with very strict freshness requirement to trigger fallback
  const strictOracle = new PriceOracle({
    chainId: 1,
    rpcUrl: process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
    maxPriceAge: 1, // Only 1 second (will trigger fallback)
    cacheTTL: 0 // Disable cache
  });
  
  await strictOracle.initialize();
  
  const fallbackPrice = await strictOracle.getPrice('ETH');
  console.log(`Asset: ${fallbackPrice.asset}`);
  console.log(`Price: $${fallbackPrice.price.toFixed(2)}`);
  console.log(`Source: ${fallbackPrice.source}`);
  
  if (fallbackPrice.source === 'uniswap_v3_twap') {
    console.log(` Fallback triggered! Using TWAP instead of Chainlink`);
    console.log(`TWAP Period: ${fallbackPrice.twapPeriod}s`);
  } else {
    console.log(` Chainlink was fresh enough (age: ${fallbackPrice.age}s)`);
  }
  console.log();
  
  // Example 4: Multiple assets with TWAP
  console.log(' Example 4: Multiple Assets TWAP');
  console.log('-'.repeat(60));
  
  const assets = ['ETH', 'WBTC', 'DAI'];
  
  for (const asset of assets) {
    try {
      const twap = await oracle.getUniswapTWAP(asset, 1800);
      console.log(`${asset}: $${twap.price.toFixed(2)} (${twap.source})`);
    } catch (error) {
      console.log(`${asset}: ${error.message}`);
    }
  }
  console.log();
  
  // Example 5: Compare Chainlink vs TWAP
  console.log(' Example 5: Chainlink vs TWAP Comparison');
  console.log('-'.repeat(60));
  
  const asset = 'WBTC';
  
  // Clear cache to get fresh data
  oracle.invalidateCache(asset);
  
  const chainlinkPrice = await oracle.getPrice(asset);
  const twapPrice = await oracle.getUniswapTWAP(asset, 1800);
  
  const difference = Math.abs(chainlinkPrice.price - twapPrice.price);
  const percentDiff = (difference / chainlinkPrice.price) * 100;
  
  console.log(`Asset: ${asset}`);
  console.log(`Chainlink: $${chainlinkPrice.price.toFixed(2)}`);
  console.log(`TWAP (30m): $${twapPrice.price.toFixed(2)}`);
  console.log(`Difference: $${difference.toFixed(2)} (${percentDiff.toFixed(2)}%)`);
  console.log();
  
  console.log('='.repeat(60));
  console.log(' All examples completed successfully!');
}

// Run examples
main().catch(console.error);
