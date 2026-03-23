/**
 * PriceOracle Usage Example
 * 
 * Demonstrates how to use the PriceOracle class to fetch
 * real-time asset prices from Chainlink price feeds.
 */

import { PriceOracle } from '../src/price-oracle.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log(' PriceOracle Example\n');
  
  // Initialize PriceOracle
  console.log('1⃣  Initializing PriceOracle...');
  const oracle = new PriceOracle({
    chainId: 1, // Ethereum mainnet
    rpcUrl: process.env.RPC_URL || 'https://ethereum.publicnode.com',
    cacheTTL: 60000, // 60 seconds
    maxPriceAge: 3600, // 1 hour
    anomalyThreshold: 0.10 // 10%
  });
  
  await oracle.initialize();
  console.log(' PriceOracle initialized\n');
  
  // Example 1: Get single asset price
  console.log('2⃣  Fetching ETH price...');
  const ethPrice = await oracle.getPrice('ETH');
  console.log(`   ETH: $${ethPrice.price.toFixed(2)}`);
  console.log(`   Age: ${ethPrice.age}s`);
  console.log(`   Source: ${ethPrice.source}\n`);
  
  // Example 2: Get multiple asset prices
  console.log('3⃣  Fetching multiple asset prices...');
  const assets = ['ETH', 'WBTC', 'DAI'];
  const prices = await oracle.getPrices(assets);
  
  console.log('   Prices:');
  for (const [asset, priceData] of prices.entries()) {
    if (priceData) {
      console.log(`   - ${asset}: $${priceData.price.toFixed(2)}`);
    }
  }
  console.log();
  
  // Example 3: Demonstrate caching
  console.log('4⃣  Demonstrating price caching...');
  console.log('   First fetch (from Chainlink):');
  const start1 = Date.now();
  await oracle.getPrice('WBTC');
  console.log(`   Time: ${Date.now() - start1}ms`);
  
  console.log('   Second fetch (from cache):');
  const start2 = Date.now();
  await oracle.getPrice('WBTC');
  console.log(`   Time: ${Date.now() - start2}ms\n`);
  
  // Example 4: Check supported assets
  console.log('5⃣  Supported assets:');
  const supported = oracle.getSupportedAssets();
  console.log(`   ${supported.join(', ')}\n`);
  
  // Example 5: Cache statistics
  console.log('6⃣  Cache statistics:');
  const stats = oracle.getCacheStats();
  console.log(`   Cached assets: ${stats.size}`);
  console.log(`   Assets: ${stats.assets.join(', ')}`);
  console.log(`   TTL: ${stats.ttl}ms\n`);
  
  // Example 6: Price history
  console.log('7⃣  Price history for ETH:');
  const history = oracle.getHistory('ETH');
  if (history.length > 0) {
    console.log(`   Entries: ${history.length}`);
    history.forEach((entry, idx) => {
      console.log(`   ${idx + 1}. $${entry.price.toFixed(2)}`);
    });
  } else {
    console.log('   No history available yet');
  }
  
  console.log('\n Example completed!');
}

main().catch(console.error);
