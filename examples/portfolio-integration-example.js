/**
 * Portfolio Integration Example
 * 
 * Demonstrates full integration of PortfolioCalculator with:
 * - Price Oracle (real-time prices)
 * - Protocol Registry (position data)
 * - Strategy Engine (allocation decisions)
 */

import { PortfolioCalculator } from '../src/portfolio-calculator.js';
import { PriceOracle } from '../src/price-oracle.js';
import { ProtocolRegistry } from '../src/protocol-registry.js';
import { StrategyEngine, StrategyType } from '../src/strategy-engine.js';

/**
 * Example: Full portfolio management workflow
 */
async function fullPortfolioWorkflow() {
  console.log('\n Full Portfolio Management Workflow');
  console.log('='.repeat(70));
  
  // 1. Initialize Price Oracle
  console.log('\n Step 1: Initialize Price Oracle');
  const priceOracle = new PriceOracle({
    chainId: 1,
    rpcUrl: process.env.RPC_URL || 'https://ethereum.publicnode.com'
  });
  
  await priceOracle.initialize();
  console.log(' Price Oracle ready');
  
  // 2. Initialize Protocol Registry
  console.log('\n Step 2: Initialize Protocol Registry');
  const protocolRegistry = new ProtocolRegistry();
  console.log(' Protocol Registry ready');
  
  // 3. Initialize Portfolio Calculator
  console.log('\n Step 3: Initialize Portfolio Calculator');
  const calculator = new PortfolioCalculator();
  calculator.setIntegrations({
    priceOracle,
    protocolRegistry
  });
  console.log(' Portfolio Calculator ready');
  
  // 4. Initialize Strategy Engine
  console.log('\n Step 4: Initialize Strategy Engine');
  const strategyEngine = new StrategyEngine();
  strategyEngine.setIntegrations({
    priceOracle,
    protocolRegistry
  });
  strategyEngine.setStrategy(StrategyType.BALANCED);
  console.log(' Strategy Engine ready (Balanced Strategy)');
  
  // 5. Simulate current portfolio positions
  console.log('\n Step 5: Analyze Current Portfolio');
  const currentPositions = [
    { protocol: 'aave-v3', asset: 'ETH', amount: 10, type: 'supplied', apy: 3.5 },
    { protocol: 'compound-v3', asset: 'USDC', amount: 20000, type: 'supplied', apy: 4.5 },
    { protocol: 'aave-v3', asset: 'DAI', amount: 5000, type: 'supplied', apy: 4.0 }
  ];
  
  // Calculate portfolio value with real-time prices
  const portfolioValue = await calculator.calculatePortfolioValue(currentPositions);
  console.log(`  Total Portfolio Value: $${portfolioValue.totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  
  // Calculate weighted APY
  const weightedAPY = await calculator.calculateWeightedAPY(currentPositions);
  console.log(`  Portfolio Weighted APY: ${weightedAPY.weightedAPY.toFixed(2)}%`);
  
  // Calculate allocation
  const allocation = await calculator.calculateAllocation(currentPositions);
  console.log('\n  Current Allocation:');
  for (const item of allocation.allocations) {
    console.log(`    ${item.protocol} ${item.asset}: ${item.percentage.toFixed(1)}% ($${item.valueUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })})`);
  }
  
  // 6. Calculate projected returns
  console.log('\n Step 6: Calculate Projected Returns');
  const projection30d = await calculator.calculateProjectedValue(currentPositions, 30);
  const projection90d = await calculator.calculateProjectedValue(currentPositions, 90);
  const projection365d = await calculator.calculateProjectedValue(currentPositions, 365);
  
  console.log(`  30 Days: $${projection30d.projectedGain.toLocaleString('en-US', { minimumFractionDigits: 2 })} (+${projection30d.projectedGainPercentage.toFixed(2)}%)`);
  console.log(`  90 Days: $${projection90d.projectedGain.toLocaleString('en-US', { minimumFractionDigits: 2 })} (+${projection90d.projectedGainPercentage.toFixed(2)}%)`);
  console.log(`  365 Days: $${projection365d.projectedGain.toLocaleString('en-US', { minimumFractionDigits: 2 })} (+${projection365d.projectedGainPercentage.toFixed(2)}%)`);
  
  // 7. Simulate available yield opportunities
  console.log('\n Step 7: Evaluate Yield Opportunities');
  const availableYields = [
    { protocol: 'aave-v3', asset: 'ETH', totalAPY: 3.5, riskScore: 85, risk: 'low' },
    { protocol: 'compound-v3', asset: 'USDC', totalAPY: 4.8, riskScore: 80, risk: 'low' },
    { protocol: 'aave-v3', asset: 'DAI', totalAPY: 4.2, riskScore: 85, risk: 'low' },
    { protocol: 'spark', asset: 'USDT', totalAPY: 5.5, riskScore: 75, risk: 'medium' }
  ];
  
  console.log('  Available Opportunities:');
  for (const opportunity of availableYields) {
    console.log(`    ${opportunity.protocol} ${opportunity.asset}: ${opportunity.totalAPY}% APY (Risk: ${opportunity.risk})`);
  }
  
  // 8. Calculate optimal allocation using Strategy Engine
  console.log('\n Step 8: Calculate Optimal Allocation');
  const optimalAllocation = strategyEngine.calculateOptimalAllocation(
    currentPositions,
    availableYields,
    { maxPerPosition: 40 }
  );
  
  console.log(`  Expected APY: ${optimalAllocation.expectedAPY.toFixed(2)}%`);
  console.log(`  Position Count: ${optimalAllocation.positionCount}`);
  console.log(`  Total Allocated: ${optimalAllocation.totalAllocated.toFixed(1)}%`);
  
  // 9. Check if rebalancing is recommended
  console.log('\n Step 9: Evaluate Rebalancing Decision');
  const currentAllocation = {
    expectedAPY: weightedAPY.weightedAPY
  };
  
  const rebalanceDecision = strategyEngine.shouldRebalance(
    currentAllocation,
    optimalAllocation
  );
  
  console.log(`  Current APY: ${rebalanceDecision.currentAPY.toFixed(2)}%`);
  console.log(`  Optimal APY: ${rebalanceDecision.optimalAPY.toFixed(2)}%`);
  console.log(`  APY Improvement: ${rebalanceDecision.apyImprovement.toFixed(2)}%`);
  console.log(`  Threshold: ${rebalanceDecision.threshold}%`);
  console.log(`  Should Rebalance: ${rebalanceDecision.shouldRebalance ? ' Yes' : ' No'}`);
  console.log(`  Rationale: ${rebalanceDecision.rationale}`);
  
  // 10. Summary
  console.log('\n Step 10: Portfolio Summary');
  console.log('='.repeat(70));
  console.log(`   Total Value: $${portfolioValue.totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`   Current APY: ${weightedAPY.weightedAPY.toFixed(2)}%`);
  console.log(`   Optimal APY: ${optimalAllocation.expectedAPY.toFixed(2)}%`);
  console.log(`   Positions: ${currentPositions.length}`);
  console.log(`   Rebalance: ${rebalanceDecision.shouldRebalance ? 'Recommended' : 'Not needed'}`);
  
  if (rebalanceDecision.shouldRebalance) {
    console.log(`   Potential Gain: +${rebalanceDecision.apyImprovement.toFixed(2)}% APY`);
  }
}

/**
 * Example: Monitor portfolio health with leveraged positions
 */
async function monitorLeveragedPortfolio() {
  console.log('\n Monitor Leveraged Portfolio Health');
  console.log('='.repeat(70));
  
  // Initialize components
  const priceOracle = new PriceOracle({
    chainId: 1,
    rpcUrl: process.env.RPC_URL || 'https://ethereum.publicnode.com'
  });
  
  await priceOracle.initialize();
  
  const calculator = new PortfolioCalculator();
  calculator.setIntegrations({ priceOracle });
  
  // Leveraged positions
  const positions = [
    { protocol: 'aave-v3', asset: 'ETH', amount: 15, type: 'supplied', apy: 3.5 },
    { protocol: 'aave-v3', asset: 'USDC', amount: 12000, type: 'borrowed', apy: 5.2 }
  ];
  
  console.log('\n Portfolio Analysis:');
  
  // Calculate portfolio value
  const portfolioValue = await calculator.calculatePortfolioValue(positions);
  console.log(`  Collateral Value: $${portfolioValue.totalSuppliedUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  Borrowed Value: $${portfolioValue.totalBorrowedUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  Net Value: $${portfolioValue.netValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  
  // Calculate health factor
  const healthFactor = await calculator.calculateHealthFactor(positions, 0.85);
  console.log(`\n Health Factor: ${healthFactor.healthFactor.toFixed(2)}`);
  
  // Health status
  if (healthFactor.healthFactor > 2.5) {
    console.log('  Status:  Very Safe');
    console.log('  Action: None required');
  } else if (healthFactor.healthFactor > 2.0) {
    console.log('  Status:  Safe');
    console.log('  Action: Monitor price movements');
  } else if (healthFactor.healthFactor > 1.5) {
    console.log('  Status:   Moderate Risk');
    console.log('  Action: Consider reducing leverage');
  } else if (healthFactor.healthFactor > 1.0) {
    console.log('  Status:  High Risk');
    console.log('  Action: Reduce leverage immediately!');
  } else {
    console.log('  Status:  CRITICAL');
    console.log('  Action: Position may be liquidated!');
  }
  
  // Calculate leverage ratio
  const leverageRatio = portfolioValue.totalSuppliedUSD / portfolioValue.netValueUSD;
  console.log(`\n Leverage Ratio: ${leverageRatio.toFixed(2)}x`);
  
  // Calculate liquidation price for ETH
  const ethPosition = positions.find(p => p.asset === 'ETH');
  const ethPrice = portfolioValue.positionValues.find(p => p.asset === 'ETH').price;
  const liquidationPrice = (portfolioValue.totalBorrowedUSD / (ethPosition.amount * 0.85));
  const priceDropToLiquidation = ((ethPrice - liquidationPrice) / ethPrice) * 100;
  
  console.log(`\n ETH Price Analysis:`);
  console.log(`  Current Price: $${ethPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  Liquidation Price: $${liquidationPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  Buffer: ${priceDropToLiquidation.toFixed(2)}% price drop to liquidation`);
}

/**
 * Example: Compare different portfolio strategies
 */
async function compareStrategies() {
  console.log('\n Compare Portfolio Strategies');
  console.log('='.repeat(70));
  
  // Initialize components
  const priceOracle = new PriceOracle({
    chainId: 1,
    rpcUrl: process.env.RPC_URL || 'https://ethereum.publicnode.com'
  });
  
  await priceOracle.initialize();
  
  const calculator = new PortfolioCalculator();
  calculator.setIntegrations({ priceOracle });
  
  // Define three different portfolio strategies
  const strategies = {
    conservative: [
      { protocol: 'aave-v3', asset: 'USDC', amount: 30000, type: 'supplied', apy: 4.0 },
      { protocol: 'compound-v3', asset: 'DAI', amount: 20000, type: 'supplied', apy: 3.8 }
    ],
    balanced: [
      { protocol: 'aave-v3', asset: 'ETH', amount: 10, type: 'supplied', apy: 3.5 },
      { protocol: 'compound-v3', asset: 'USDC', amount: 20000, type: 'supplied', apy: 4.5 }
    ],
    aggressive: [
      { protocol: 'aave-v3', asset: 'ETH', amount: 15, type: 'supplied', apy: 3.5 },
      { protocol: 'aave-v3', asset: 'USDC', amount: 10000, type: 'borrowed', apy: 5.2 },
      { protocol: 'compound-v3', asset: 'USDC', amount: 10000, type: 'supplied', apy: 4.8 }
    ]
  };
  
  console.log('\n Strategy Comparison:\n');
  
  for (const [strategyName, positions] of Object.entries(strategies)) {
    console.log(`  ${strategyName.toUpperCase()} Strategy:`);
    
    const portfolioValue = await calculator.calculatePortfolioValue(positions);
    const weightedAPY = await calculator.calculateWeightedAPY(positions);
    
    console.log(`    Total Value: $${portfolioValue.totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`    Net Value: $${portfolioValue.netValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`    Weighted APY: ${weightedAPY.weightedAPY.toFixed(2)}%`);
    
    // Calculate health factor if leveraged
    if (portfolioValue.totalBorrowedUSD > 0) {
      const healthFactor = await calculator.calculateHealthFactor(positions, 0.85);
      console.log(`    Health Factor: ${healthFactor.healthFactor.toFixed(2)}`);
      const leverageRatio = portfolioValue.totalSuppliedUSD / portfolioValue.netValueUSD;
      console.log(`    Leverage: ${leverageRatio.toFixed(2)}x`);
    } else {
      console.log(`    Health Factor: N/A (No leverage)`);
      console.log(`    Leverage: 1.00x`);
    }
    
    // Calculate 1-year projection
    const projection = await calculator.calculateProjectedValue(positions, 365);
    console.log(`    1-Year Projected Gain: $${projection.projectedGain.toLocaleString('en-US', { minimumFractionDigits: 2 })} (+${projection.projectedGainPercentage.toFixed(2)}%)`);
    console.log('');
  }
}

/**
 * Run all integration examples
 */
async function runAllExamples() {
  console.log(' Portfolio Integration Examples');
  console.log('='.repeat(70));
  
  try {
    await fullPortfolioWorkflow();
    await monitorLeveragedPortfolio();
    await compareStrategies();
    
    console.log('\n All integration examples completed successfully!');
  } catch (error) {
    console.error('\n Example failed:', error.message);
    console.error(error.stack);
  }
}

// Run examples
runAllExamples().catch(console.error);
