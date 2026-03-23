/**
 * Portfolio Calculator Example
 * 
 * Demonstrates portfolio value and yield calculations with real-time price integration
 */

import { PortfolioCalculator } from '../src/portfolio-calculator.js';
import { PriceOracle } from '../src/price-oracle.js';
import { ProtocolRegistry } from '../src/protocol-registry.js';

/**
 * Example: Calculate portfolio value with real-time prices
 */
async function examplePortfolioValue() {
  console.log('\n Example: Calculate Portfolio Value with Real-Time Prices');
  console.log('='.repeat(70));
  
  // Initialize Price Oracle
  const priceOracle = new PriceOracle({
    chainId: 1,
    rpcUrl: process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo'
  });
  
  await priceOracle.initialize();
  
  // Initialize Portfolio Calculator
  const calculator = new PortfolioCalculator();
  calculator.setIntegrations({ priceOracle });
  
  // Example positions
  const positions = [
    { protocol: 'aave-v3', asset: 'ETH', amount: 10, type: 'supplied', apy: 3.5 },
    { protocol: 'aave-v3', asset: 'USDC', amount: 5000, type: 'supplied', apy: 4.2 },
    { protocol: 'compound-v3', asset: 'USDT', amount: 3000, type: 'supplied', apy: 3.8 },
    { protocol: 'aave-v3', asset: 'DAI', amount: 2000, type: 'supplied', apy: 4.0 }
  ];
  
  // Calculate portfolio value
  const portfolioValue = await calculator.calculatePortfolioValue(positions);
  
  console.log('\n Portfolio Value:');
  console.log(`  Total Value: $${portfolioValue.totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  Total Supplied: $${portfolioValue.totalSuppliedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  Net Value: $${portfolioValue.netValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  
  console.log('\n Position Breakdown:');
  for (const position of portfolioValue.positionValues) {
    console.log(`  ${position.protocol} - ${position.asset}:`);
    console.log(`    Amount: ${position.amount}`);
    console.log(`    Price: $${position.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`    Value: $${position.valueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`    APY: ${position.apy}%`);
    console.log(`    Price Source: ${position.priceSource}`);
    console.log(`    Price Age: ${position.priceAge}s`);
  }
}

/**
 * Example: Calculate weighted APY
 */
async function exampleWeightedAPY() {
  console.log('\n Example: Calculate Weighted APY');
  console.log('='.repeat(70));
  
  // Initialize Price Oracle
  const priceOracle = new PriceOracle({
    chainId: 1,
    rpcUrl: process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo'
  });
  
  await priceOracle.initialize();
  
  // Initialize Portfolio Calculator
  const calculator = new PortfolioCalculator();
  calculator.setIntegrations({ priceOracle });
  
  // Example positions with different APYs
  const positions = [
    { protocol: 'aave-v3', asset: 'ETH', amount: 10, type: 'supplied', apy: 3.5 },
    { protocol: 'compound-v3', asset: 'USDC', amount: 20000, type: 'supplied', apy: 4.5 },
    { protocol: 'aave-v3', asset: 'DAI', amount: 5000, type: 'supplied', apy: 4.0 }
  ];
  
  // Calculate weighted APY
  const weightedAPY = await calculator.calculateWeightedAPY(positions);
  
  console.log('\n Weighted APY Analysis:');
  console.log(`  Portfolio Weighted APY: ${weightedAPY.weightedAPY.toFixed(2)}%`);
  console.log(`  Total Portfolio Value: $${weightedAPY.totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  
  console.log('\n APY Breakdown by Position:');
  for (const item of weightedAPY.breakdown) {
    console.log(`  ${item.protocol} - ${item.asset}:`);
    console.log(`    Value: $${item.valueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`    Weight: ${item.weight.toFixed(2)}%`);
    console.log(`    APY: ${item.apy}%`);
    console.log(`    Contribution to Portfolio APY: ${item.contribution.toFixed(2)}%`);
  }
}

/**
 * Example: Calculate health factor for leveraged positions
 */
async function exampleHealthFactor() {
  console.log('\n Example: Calculate Health Factor');
  console.log('='.repeat(70));
  
  // Initialize Price Oracle
  const priceOracle = new PriceOracle({
    chainId: 1,
    rpcUrl: process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo'
  });
  
  await priceOracle.initialize();
  
  // Initialize Portfolio Calculator
  const calculator = new PortfolioCalculator();
  calculator.setIntegrations({ priceOracle });
  
  // Example leveraged positions
  const positions = [
    { protocol: 'aave-v3', asset: 'ETH', amount: 10, type: 'supplied', apy: 3.5 },
    { protocol: 'aave-v3', asset: 'USDC', amount: 8000, type: 'borrowed', apy: 5.2 }
  ];
  
  // Calculate health factor
  const healthFactor = await calculator.calculateHealthFactor(positions, 0.85);
  
  console.log('\n Health Factor Analysis:');
  console.log(`  Health Factor: ${healthFactor.healthFactor.toFixed(2)}`);
  console.log(`  Status: ${healthFactor.isHealthy ? ' Healthy' : '  At Risk'}`);
  console.log(`  Collateral Value: $${healthFactor.collateralValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  Borrowed Value: $${healthFactor.borrowedValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  Liquidation Threshold: ${(healthFactor.liquidationThreshold * 100).toFixed(0)}%`);
  console.log(`  Max Safe Borrow: $${healthFactor.maxBorrowValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  
  // Health factor interpretation
  console.log('\n Health Factor Guide:');
  console.log('  > 2.5: Very Safe (Conservative)');
  console.log('  2.0 - 2.5: Safe (Balanced)');
  console.log('  1.5 - 2.0: Moderate Risk (Aggressive)');
  console.log('  1.0 - 1.5: High Risk (Danger Zone)');
  console.log('  < 1.0: Liquidation Risk');
  
  if (healthFactor.healthFactor > 2.5) {
    console.log('\n Your position is very safe with plenty of buffer.');
  } else if (healthFactor.healthFactor > 2.0) {
    console.log('\n Your position is safe but monitor price movements.');
  } else if (healthFactor.healthFactor > 1.5) {
    console.log('\n  Your position has moderate risk. Consider reducing leverage.');
  } else if (healthFactor.healthFactor > 1.0) {
    console.log('\n  Your position is at high risk. Reduce leverage immediately!');
  } else {
    console.log('\n CRITICAL: Your position may be liquidated! Take action now!');
  }
}

/**
 * Example: Calculate portfolio allocation
 */
async function exampleAllocation() {
  console.log('\n Example: Calculate Portfolio Allocation');
  console.log('='.repeat(70));
  
  // Initialize Price Oracle
  const priceOracle = new PriceOracle({
    chainId: 1,
    rpcUrl: process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo'
  });
  
  await priceOracle.initialize();
  
  // Initialize Portfolio Calculator
  const calculator = new PortfolioCalculator();
  calculator.setIntegrations({ priceOracle });
  
  // Example diversified positions
  const positions = [
    { protocol: 'aave-v3', asset: 'ETH', amount: 5, type: 'supplied', apy: 3.5 },
    { protocol: 'compound-v3', asset: 'USDC', amount: 15000, type: 'supplied', apy: 4.5 },
    { protocol: 'aave-v3', asset: 'DAI', amount: 8000, type: 'supplied', apy: 4.0 },
    { protocol: 'compound-v3', asset: 'USDT', amount: 5000, type: 'supplied', apy: 4.2 }
  ];
  
  // Calculate allocation
  const allocation = await calculator.calculateAllocation(positions);
  
  console.log('\n Portfolio Allocation:');
  console.log(`  Total Portfolio Value: $${allocation.totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  
  console.log('\n Allocation Breakdown:');
  for (const item of allocation.allocations) {
    const bar = '█'.repeat(Math.round(item.percentage / 2));
    console.log(`  ${item.protocol} - ${item.asset}:`);
    console.log(`    ${bar} ${item.percentage.toFixed(2)}%`);
    console.log(`    Value: $${item.valueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`    APY: ${item.apy}%`);
  }
}

/**
 * Example: Calculate projected portfolio value
 */
async function exampleProjectedValue() {
  console.log('\n Example: Calculate Projected Portfolio Value');
  console.log('='.repeat(70));
  
  // Initialize Price Oracle
  const priceOracle = new PriceOracle({
    chainId: 1,
    rpcUrl: process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo'
  });
  
  await priceOracle.initialize();
  
  // Initialize Portfolio Calculator
  const calculator = new PortfolioCalculator();
  calculator.setIntegrations({ priceOracle });
  
  // Example positions
  const positions = [
    { protocol: 'aave-v3', asset: 'USDC', amount: 50000, type: 'supplied', apy: 5.0 }
  ];
  
  // Calculate projections for different time periods
  const periods = [30, 90, 180, 365];
  
  console.log('\n Portfolio Value Projections:');
  
  for (const days of periods) {
    const projection = await calculator.calculateProjectedValue(positions, days);
    
    console.log(`\n  ${days} Days:`);
    console.log(`    Current Value: $${projection.currentValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`    Projected Value: $${projection.projectedValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`    Projected Gain: $${projection.projectedGain.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (+${projection.projectedGainPercentage.toFixed(2)}%)`);
    console.log(`    Weighted APY: ${projection.weightedAPY.toFixed(2)}%`);
  }
}

/**
 * Example: Compare portfolio performance
 */
async function examplePerformanceComparison() {
  console.log('\n Example: Compare Portfolio Performance');
  console.log('='.repeat(70));
  
  // Initialize Price Oracle
  const priceOracle = new PriceOracle({
    chainId: 1,
    rpcUrl: process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo'
  });
  
  await priceOracle.initialize();
  
  // Initialize Portfolio Calculator
  const calculator = new PortfolioCalculator();
  calculator.setIntegrations({ priceOracle });
  
  // Current positions
  const currentPositions = [
    { protocol: 'aave-v3', asset: 'ETH', amount: 12, type: 'supplied', apy: 3.5 },
    { protocol: 'compound-v3', asset: 'USDC', amount: 25000, type: 'supplied', apy: 4.5 }
  ];
  
  // Previous snapshot (simulated - 30 days ago)
  const previousSnapshot = {
    totalValueUSD: 45000,
    timestamp: Date.now() - (30 * 24 * 60 * 60 * 1000) // 30 days ago
  };
  
  // Calculate performance
  const performance = await calculator.calculatePerformance(currentPositions, previousSnapshot);
  
  console.log('\n Performance Analysis (30 Days):');
  console.log(`  Previous Value: $${performance.previousValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  Current Value: $${performance.currentValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  Absolute Change: $${performance.absoluteChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  Percentage Change: ${performance.percentageChange >= 0 ? '+' : ''}${performance.percentageChange.toFixed(2)}%`);
  console.log(`  Current APY: ${performance.currentAPY.toFixed(2)}%`);
  console.log(`  Time Period: ${Math.round(performance.timePeriod / (24 * 60 * 60 * 1000))} days`);
  
  if (performance.percentageChange > 0) {
    console.log('\n Portfolio has grown! Keep up the good work.');
  } else if (performance.percentageChange < 0) {
    console.log('\n  Portfolio has decreased. Review your strategy.');
  } else {
    console.log('\n Portfolio value is stable.');
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log(' Portfolio Calculator Examples');
  console.log('='.repeat(70));
  
  try {
    await examplePortfolioValue();
    await exampleWeightedAPY();
    await exampleHealthFactor();
    await exampleAllocation();
    await exampleProjectedValue();
    await examplePerformanceComparison();
    
    console.log('\n All examples completed successfully!');
  } catch (error) {
    console.error('\n Example failed:', error.message);
    console.error(error.stack);
  }
}

// Run examples
runAllExamples().catch(console.error);
