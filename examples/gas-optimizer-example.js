/**
 * Gas Optimizer Example
 * 
 * Demonstrates how to use the Gas Optimizer for:
 * - Fetching current gas prices across multiple chains
 * - Calculating EIP-1559 fees
 * - Monitoring gas prices in real-time
 * - Checking gas thresholds for optimal transaction timing
 */

import { GasOptimizer } from '../src/gas-optimizer.js';
import { ethers } from 'ethers';

/**
 * Example 1: Basic gas price fetching
 */
async function example1_BasicGasPriceFetching() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 1: Basic Gas Price Fetching');
  console.log('='.repeat(60));
  
  const gasOptimizer = new GasOptimizer({
    chainId: 1 // Ethereum mainnet
  });
  
  await gasOptimizer.initialize();
  
  // Get current gas price for Ethereum
  const ethGas = await gasOptimizer.getCurrentGasPrice(1);
  console.log('\n Ethereum Gas Price:');
  console.log(`   Type: ${ethGas.type}`);
  if (ethGas.type === 'eip1559') {
    console.log(`   Base Fee: ${ethGas.baseFeeGwei.toFixed(2)} gwei`);
    console.log(`   Max Priority Fee: ${ethGas.maxPriorityFeeGwei.toFixed(2)} gwei`);
    console.log(`   Max Fee: ${ethGas.maxFeeGwei.toFixed(2)} gwei`);
  } else {
    console.log(`   Gas Price: ${ethGas.gasPriceGwei.toFixed(2)} gwei`);
  }
  
  // Get current gas price for Arbitrum
  const arbGas = await gasOptimizer.getCurrentGasPrice(42161);
  console.log('\n Arbitrum Gas Price:');
  console.log(`   Type: ${arbGas.type}`);
  const arbGasGwei = arbGas.type === 'eip1559' ? arbGas.maxFeeGwei : arbGas.gasPriceGwei;
  console.log(`   Gas Price: ${arbGasGwei.toFixed(4)} gwei`);
  
  // Get current gas price for Optimism
  const opGas = await gasOptimizer.getCurrentGasPrice(10);
  console.log('\n Optimism Gas Price:');
  console.log(`   Type: ${opGas.type}`);
  const opGasGwei = opGas.type === 'eip1559' ? opGas.maxFeeGwei : opGas.gasPriceGwei;
  console.log(`   Gas Price: ${opGasGwei.toFixed(4)} gwei`);
  
  await gasOptimizer.cleanup();
}

/**
 * Example 2: EIP-1559 fee calculation
 */
async function example2_EIP1559FeeCalculation() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 2: EIP-1559 Fee Calculation');
  console.log('='.repeat(60));
  
  const gasOptimizer = new GasOptimizer({
    chainId: 1,
    maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'), // 2 gwei tip
    maxFeeMultiplier: 1.5 // 1.5x base fee
  });
  
  await gasOptimizer.initialize();
  
  // Calculate fees with default settings
  const defaultFees = await gasOptimizer.calculateEIP1559Fees(1);
  console.log('\n EIP-1559 Fees (Default Settings):');
  console.log(`   Base Fee: ${defaultFees.baseFeeGwei.toFixed(2)} gwei`);
  console.log(`   Max Priority Fee: ${defaultFees.maxPriorityFeeGwei.toFixed(2)} gwei`);
  console.log(`   Max Fee: ${defaultFees.maxFeeGwei.toFixed(2)} gwei`);
  
  // Calculate fees with custom settings (higher priority for faster inclusion)
  const fastFees = await gasOptimizer.calculateEIP1559Fees(1, {
    maxPriorityFeePerGas: ethers.parseUnits('5', 'gwei'), // 5 gwei tip
    maxFeeMultiplier: 2.0 // 2x base fee
  });
  console.log('\n EIP-1559 Fees (Fast Settings):');
  console.log(`   Base Fee: ${fastFees.baseFeeGwei.toFixed(2)} gwei`);
  console.log(`   Max Priority Fee: ${fastFees.maxPriorityFeeGwei.toFixed(2)} gwei`);
  console.log(`   Max Fee: ${fastFees.maxFeeGwei.toFixed(2)} gwei`);
  
  // Calculate fees with custom settings (lower priority for cost savings)
  const economyFees = await gasOptimizer.calculateEIP1559Fees(1, {
    maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'), // 1 gwei tip
    maxFeeMultiplier: 1.2 // 1.2x base fee
  });
  console.log('\n EIP-1559 Fees (Economy Settings):');
  console.log(`   Base Fee: ${economyFees.baseFeeGwei.toFixed(2)} gwei`);
  console.log(`   Max Priority Fee: ${economyFees.maxPriorityFeeGwei.toFixed(2)} gwei`);
  console.log(`   Max Fee: ${economyFees.maxFeeGwei.toFixed(2)} gwei`);
  
  await gasOptimizer.cleanup();
}

/**
 * Example 3: Gas price monitoring
 */
async function example3_GasPriceMonitoring() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 3: Gas Price Monitoring');
  console.log('='.repeat(60));
  
  let updateCount = 0;
  
  const gasOptimizer = new GasOptimizer({
    chainId: 1,
    monitoringInterval: 30000, // 30 seconds
    onGasPriceUpdate: (gasPrice) => {
      updateCount++;
      const gasGwei = gasPrice.type === 'eip1559' ? gasPrice.maxFeeGwei : gasPrice.gasPriceGwei;
      console.log(`\n Gas Update #${updateCount} - ${gasPrice.chainName}:`);
      console.log(`   Gas Price: ${gasGwei.toFixed(4)} gwei`);
      console.log(`   Time: ${new Date(gasPrice.timestamp).toLocaleTimeString()}`);
    }
  });
  
  await gasOptimizer.initialize();
  
  console.log('\n Starting gas price monitoring...');
  console.log('   Monitoring all chains every 30 seconds');
  console.log('   Press Ctrl+C to stop\n');
  
  gasOptimizer.startMonitoring();
  
  // Monitor for 2 minutes in this example
  await new Promise(resolve => setTimeout(resolve, 120000));
  
  gasOptimizer.stopMonitoring();
  console.log(`\n Monitoring stopped. Total updates: ${updateCount}`);
  
  await gasOptimizer.cleanup();
}

/**
 * Example 4: Gas threshold checking for optimal transaction timing
 */
async function example4_GasThresholdChecking() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 4: Gas Threshold Checking');
  console.log('='.repeat(60));
  
  const gasOptimizer = new GasOptimizer({
    chainId: 1,
    gasThresholds: {
      1: 30,      // Execute on Ethereum when gas < 30 gwei
      42161: 0.1, // Execute on Arbitrum when gas < 0.1 gwei
      10: 0.01    // Execute on Optimism when gas < 0.01 gwei
    }
  });
  
  await gasOptimizer.initialize();
  
  // Check if gas is below threshold for each chain
  const chains = [
    { id: 1, name: 'Ethereum' },
    { id: 42161, name: 'Arbitrum' },
    { id: 10, name: 'Optimism' }
  ];
  
  console.log('\n Checking gas thresholds for transaction execution:\n');
  
  for (const chain of chains) {
    const gasPrice = await gasOptimizer.getCurrentGasPrice(chain.id);
    const isBelowThreshold = gasOptimizer.isGasBelowThreshold(chain.id);
    const gasGwei = gasPrice.type === 'eip1559' ? gasPrice.maxFeeGwei : gasPrice.gasPriceGwei;
    const threshold = gasOptimizer.gasThresholds[chain.id];
    
    console.log(`${chain.name}:`);
    console.log(`   Current Gas: ${gasGwei.toFixed(4)} gwei`);
    console.log(`   Threshold: ${threshold} gwei`);
    console.log(`   Status: ${isBelowThreshold ? ' EXECUTE NOW' : '⏳ WAIT'}`);
    console.log();
  }
  
  await gasOptimizer.cleanup();
}

/**
 * Example 5: Monitoring with threshold alerts
 */
async function example5_ThresholdAlerts() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 5: Monitoring with Threshold Alerts');
  console.log('='.repeat(60));
  
  const gasOptimizer = new GasOptimizer({
    chainId: 1,
    monitoringInterval: 30000, // 30 seconds
    gasThresholds: {
      1: 40,      // Alert when Ethereum gas < 40 gwei
      42161: 0.2, // Alert when Arbitrum gas < 0.2 gwei
      10: 0.02    // Alert when Optimism gas < 0.02 gwei
    },
    onThresholdMet: (chainId, gasPrice) => {
      const gasGwei = gasPrice.type === 'eip1559' ? gasPrice.maxFeeGwei : gasPrice.gasPriceGwei;
      console.log(`\n ALERT: Gas threshold met for ${gasPrice.chainName}!`);
      console.log(`   Current Gas: ${gasGwei.toFixed(4)} gwei`);
      console.log(`   Threshold: ${gasOptimizer.gasThresholds[chainId]} gwei`);
      console.log(`    Good time to execute transactions!`);
    }
  });
  
  await gasOptimizer.initialize();
  
  console.log('\n Starting monitoring with threshold alerts...');
  console.log('   Will alert when gas prices drop below thresholds');
  console.log('   Press Ctrl+C to stop\n');
  
  gasOptimizer.startMonitoring();
  
  // Monitor for 2 minutes in this example
  await new Promise(resolve => setTimeout(resolve, 120000));
  
  gasOptimizer.stopMonitoring();
  
  await gasOptimizer.cleanup();
}

/**
 * Example 6: Gas price history analysis
 */
async function example6_GasPriceHistory() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 6: Gas Price History Analysis');
  console.log('='.repeat(60));
  
  const gasOptimizer = new GasOptimizer({
    chainId: 1,
    maxHistorySize: 10
  });
  
  await gasOptimizer.initialize();
  
  // Fetch gas prices multiple times to build history
  console.log('\n Building gas price history...');
  for (let i = 0; i < 10; i++) {
    await gasOptimizer.getCurrentGasPrice(1);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    process.stdout.write('.');
  }
  console.log(' Done!\n');
  
  // Analyze history
  const history = gasOptimizer.getGasHistory(1);
  
  console.log(`\n Gas Price History (last ${history.length} readings):\n`);
  
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  
  history.forEach((entry, index) => {
    const gasGwei = entry.type === 'eip1559' ? entry.maxFeeGwei : entry.gasPriceGwei;
    sum += gasGwei;
    min = Math.min(min, gasGwei);
    max = Math.max(max, gasGwei);
    
    console.log(`   ${index + 1}. ${gasGwei.toFixed(2)} gwei (${new Date(entry.timestamp).toLocaleTimeString()})`);
  });
  
  const avg = sum / history.length;
  
  console.log(`\n Statistics:`);
  console.log(`   Average: ${avg.toFixed(2)} gwei`);
  console.log(`   Minimum: ${min.toFixed(2)} gwei`);
  console.log(`   Maximum: ${max.toFixed(2)} gwei`);
  console.log(`   Range: ${(max - min).toFixed(2)} gwei`);
  
  await gasOptimizer.cleanup();
}

/**
 * Example 7: Multi-chain gas comparison
 */
async function example7_MultiChainComparison() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 7: Multi-Chain Gas Comparison');
  console.log('='.repeat(60));
  
  const gasOptimizer = new GasOptimizer();
  await gasOptimizer.initialize();
  
  // Get all gas prices
  const allPrices = gasOptimizer.getAllGasPrices();
  
  console.log('\n Current Gas Prices Across All Chains:\n');
  
  const priceData = [];
  for (const [chainId, gasPrice] of allPrices) {
    const gasGwei = gasPrice.type === 'eip1559' ? gasPrice.maxFeeGwei : gasPrice.gasPriceGwei;
    priceData.push({
      chainId,
      name: gasPrice.chainName,
      gasGwei,
      type: gasPrice.type
    });
  }
  
  // Sort by gas price (ascending)
  priceData.sort((a, b) => a.gasGwei - b.gasGwei);
  
  priceData.forEach((data, index) => {
    console.log(`${index + 1}. ${data.name}:`);
    console.log(`   Gas Price: ${data.gasGwei.toFixed(4)} gwei`);
    console.log(`   Type: ${data.type}`);
    if (index === 0) {
      console.log(`   ⭐ CHEAPEST - Best for transactions!`);
    }
    console.log();
  });
  
  // Calculate savings
  const cheapest = priceData[0];
  const mostExpensive = priceData[priceData.length - 1];
  const savingsPercent = ((mostExpensive.gasGwei - cheapest.gasGwei) / mostExpensive.gasGwei * 100);
  
  console.log(` Insight:`);
  console.log(`   Using ${cheapest.name} instead of ${mostExpensive.name}`);
  console.log(`   saves ${savingsPercent.toFixed(1)}% on gas costs!`);
  
  await gasOptimizer.cleanup();
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log('\n' + '='.repeat(60));
  console.log(' GAS OPTIMIZER EXAMPLES');
  console.log('='.repeat(60));
  
  try {
    await example1_BasicGasPriceFetching();
    await example2_EIP1559FeeCalculation();
    await example4_GasThresholdChecking();
    await example6_GasPriceHistory();
    await example7_MultiChainComparison();
    
    // Uncomment to run monitoring examples (they run for 2 minutes each)
    // await example3_GasPriceMonitoring();
    // await example5_ThresholdAlerts();
    
    console.log('\n' + '='.repeat(60));
    console.log(' All examples completed successfully!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n Example failed:', error);
    process.exit(1);
  }
}

// Run examples
runExamples();
