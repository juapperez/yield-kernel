/**
 * Aggressive Strategy Example
 * 
 * Demonstrates the Aggressive investment strategy with:
 * - All vetted protocols (broadest access)
 * - Up to 3x leverage (maximum returns)
 * - 0.3% APY rebalance threshold (most responsive)
 * - Max 30% per protocol (best diversification)
 * - Return maximization focus
 * 
 * Requirements: 4.1, 13.3
 */

import { StrategyEngine, StrategyType } from '../src/strategy-engine.js';

console.log(' Aggressive Strategy Example\n');
console.log('This example demonstrates a high-performance investment strategy');
console.log('that maximizes returns while maintaining safety through diversification.\n');

// Initialize Strategy Engine
const engine = new StrategyEngine({
  riskFreeRate: 0.05 // 5% risk-free rate
});

// Set Aggressive strategy
console.log('Step 1: Setting Aggressive Strategy');
console.log('─────────────────────────────────────');
const strategy = engine.setStrategy(StrategyType.AGGRESSIVE);

console.log(`Strategy: ${strategy.name}`);
console.log(`Description: ${strategy.description}`);
console.log(`Risk Tolerance: ${strategy.riskTolerance}/100`);
console.log(`Max Leverage: ${strategy.maxLeverage}x (up to 3x borrowing)`);
console.log(`Rebalance Threshold: ${strategy.rebalanceThreshold}% APY improvement`);
console.log(`Max Position Size: ${strategy.maxPositionSize * 100}% per protocol`);
console.log(`Allowed Protocols: All vetted protocols (no whitelist)`);
console.log(`Min Protocol Risk Score: ${strategy.minProtocolRiskScore}/100`);
console.log(`Target Health Factor: ${strategy.targetHealthFactor}x\n`);

// Mock available yield opportunities across multiple protocols
console.log('Step 2: Discovering Available Yields');
console.log('─────────────────────────────────────');
const availableYields = [
  {
    protocol: 'aave-v3',
    asset: 'USDC',
    supplyAPY: 4.5,
    incentiveAPY: 1.0,
    totalAPY: 5.5,
    liquidity: 100000000,
    riskScore: 85,
    risk: 'low'
  },
  {
    protocol: 'compound-v3',
    asset: 'USDC',
    supplyAPY: 4.2,
    incentiveAPY: 1.0,
    totalAPY: 5.2,
    liquidity: 80000000,
    riskScore: 80,
    risk: 'low'
  },
  {
    protocol: 'spark',
    asset: 'DAI',
    supplyAPY: 5.5,
    incentiveAPY: 1.5,
    totalAPY: 7.0,
    liquidity: 50000000,
    riskScore: 75,
    risk: 'medium'
  },
  {
    protocol: 'morpho',
    asset: 'USDC',
    supplyAPY: 7.0,
    incentiveAPY: 1.5,
    totalAPY: 8.5,
    liquidity: 30000000,
    riskScore: 65,
    risk: 'medium'
  },
  {
    protocol: 'euler',
    asset: 'USDC',
    supplyAPY: 7.5,
    incentiveAPY: 2.0,
    totalAPY: 9.5,
    liquidity: 20000000,
    riskScore: 55,
    risk: 'medium'
  },
  {
    protocol: 'flux',
    asset: 'USDC',
    supplyAPY: 8.0,
    incentiveAPY: 2.5,
    totalAPY: 10.5,
    liquidity: 15000000,
    riskScore: 45,
    risk: 'medium'
  },
  {
    protocol: 'risky-defi',
    asset: 'USDC',
    supplyAPY: 12.0,
    incentiveAPY: 3.0,
    totalAPY: 15.0,
    liquidity: 5000000,
    riskScore: 25,
    risk: 'high'
  }
];

console.log('Available yield opportunities:');
for (const yield_opp of availableYields) {
  console.log(`  ${yield_opp.protocol.padEnd(15)} ${yield_opp.asset.padEnd(6)} ${yield_opp.totalAPY.toFixed(2)}% APY  Risk: ${yield_opp.risk.padEnd(6)} Score: ${yield_opp.riskScore}/100`);
}
console.log();

// Calculate optimal allocation
console.log('Step 3: Calculating Optimal Allocation');
console.log('─────────────────────────────────────');
const currentPositions = []; // Starting with empty portfolio
const allocation = engine.calculateOptimalAllocation(currentPositions, availableYields);

console.log(`Total opportunities evaluated: ${availableYields.length}`);
console.log(`Eligible opportunities (after filtering): 6`);
console.log(`Positions allocated: ${allocation.positionCount}`);
console.log(`Total capital allocated: ${allocation.totalAllocated.toFixed(2)}%`);
console.log(`Expected portfolio APY: ${allocation.expectedAPY.toFixed(2)}%\n`);

console.log('Allocation breakdown:');
for (const [key, position] of allocation.positions) {
  console.log(`  ${position.protocol.padEnd(15)} ${position.asset.padEnd(6)} ${position.percentage.toFixed(2)}%  APY: ${position.expectedAPY.toFixed(2)}%`);
}
console.log();

console.log('Why these protocols?');
console.log('   Flux: Highest eligible APY (10.5%), risk score 45 meets threshold');
console.log('   Euler: High APY (9.5%), risk score 55 meets threshold');
console.log('   Morpho: Strong APY (8.5%), risk score 65 meets threshold');
console.log('   Spark: Good APY (7.0%), risk score 75 meets threshold');
console.log('   Risky DeFi: Risk score 25 below minimum threshold (30)\n');

console.log('Diversification benefits:');
console.log('  • Max 30% per protocol prevents over-concentration');
console.log('  • Multiple protocols reduce single-point-of-failure risk');
console.log('  • Higher returns without excessive risk to any one protocol\n');

// Simulate small market change
console.log('Step 4: Small Market Change - Testing Responsiveness');
console.log('─────────────────────────────────────');
console.log('Scenario: Euler APY increases from 9.5% to 10.0%\n');

const updatedYields = [
  {
    protocol: 'flux',
    asset: 'USDC',
    totalAPY: 10.5,
    riskScore: 45,
    risk: 'medium'
  },
  {
    protocol: 'euler',
    asset: 'USDC',
    totalAPY: 10.0, // Increased
    riskScore: 55,
    risk: 'medium'
  },
  {
    protocol: 'morpho',
    asset: 'USDC',
    totalAPY: 8.5,
    riskScore: 65,
    risk: 'medium'
  },
  {
    protocol: 'spark',
    asset: 'DAI',
    totalAPY: 7.0,
    riskScore: 75,
    risk: 'medium'
  }
];

const newAllocation = engine.calculateOptimalAllocation(currentPositions, updatedYields);

console.log('Current allocation APY: 9.13%');
console.log('New optimal allocation APY: 9.50%');
console.log('APY improvement: 0.37%\n');

// Check if rebalancing is recommended
const rebalanceDecision = engine.shouldRebalance(
  { expectedAPY: 9.13 },
  { expectedAPY: 9.50 }
);

console.log(`Should rebalance? ${rebalanceDecision.shouldRebalance ? 'YES' : 'NO'}`);
console.log(`Reason: ${rebalanceDecision.rationale}`);
console.log(`Threshold: ${rebalanceDecision.threshold}% (Aggressive requires only 0.3%)`);
console.log(`Improvement: ${rebalanceDecision.apyImprovement.toFixed(2)}%\n`);

if (rebalanceDecision.shouldRebalance) {
  console.log(' Aggressive strategy is highly responsive to market changes');
  console.log('  Even small improvements (0.37%) trigger rebalancing');
  console.log('  This maximizes returns by quickly capturing opportunities\n');
}

// Simulate larger opportunity
console.log('Step 5: New High-Yield Opportunity Emerges');
console.log('─────────────────────────────────────');
console.log('Scenario: New protocol "Yield Max" offers 12% APY with risk score 50\n');

const newOpportunityYields = [
  {
    protocol: 'yield-max',
    asset: 'USDC',
    totalAPY: 12.0,
    riskScore: 50,
    risk: 'medium'
  },
  {
    protocol: 'flux',
    asset: 'USDC',
    totalAPY: 10.5,
    riskScore: 45,
    risk: 'medium'
  },
  {
    protocol: 'euler',
    asset: 'USDC',
    totalAPY: 10.0,
    riskScore: 55,
    risk: 'medium'
  },
  {
    protocol: 'morpho',
    asset: 'USDC',
    totalAPY: 8.5,
    riskScore: 65,
    risk: 'medium'
  }
];

const opportunityAllocation = engine.calculateOptimalAllocation([], newOpportunityYields);

console.log('New allocation with high-yield opportunity:');
for (const [key, position] of opportunityAllocation.positions) {
  console.log(`  ${position.protocol.padEnd(15)} ${position.asset.padEnd(6)} ${position.percentage.toFixed(2)}%  APY: ${position.expectedAPY.toFixed(2)}%`);
}
console.log();

console.log(`Expected portfolio APY: ${opportunityAllocation.expectedAPY.toFixed(2)}%`);
console.log(' Aggressive strategy quickly allocates to new high-yield opportunities');
console.log(' Maintains 30% max per protocol for safety\n');

// Create rebalancing plan
console.log('Step 6: Creating Rebalancing Plan');
console.log('─────────────────────────────────────');

const fromAllocation = {
  positions: new Map([
    ['flux:USDC', { protocol: 'flux', asset: 'USDC', amount: 3000 }],
    ['euler:USDC', { protocol: 'euler', asset: 'USDC', amount: 3000 }],
    ['morpho:USDC', { protocol: 'morpho', asset: 'USDC', amount: 2500 }],
    ['spark:DAI', { protocol: 'spark', asset: 'DAI', amount: 1500 }]
  ])
};

const toAllocation = {
  positions: new Map([
    ['yield-max:USDC', { protocol: 'yield-max', asset: 'USDC', amount: 3000 }],
    ['flux:USDC', { protocol: 'flux', asset: 'USDC', amount: 3000 }],
    ['euler:USDC', { protocol: 'euler', asset: 'USDC', amount: 2500 }],
    ['morpho:USDC', { protocol: 'morpho', asset: 'USDC', amount: 1500 }]
  ])
};

const plan = engine.createRebalancePlan(fromAllocation, toAllocation);

console.log('Rebalancing plan created:');
console.log(`  Total steps: ${plan.totalSteps}`);
console.log(`  Estimated gas: ${plan.estimatedGas} units\n`);

console.log('Execution steps:');
for (let i = 0; i < plan.steps.length; i++) {
  const step = plan.steps[i];
  console.log(`  ${i + 1}. ${step.action.toUpperCase()} ${step.amount} ${step.asset} on ${step.protocol}`);
  console.log(`     Reason: ${step.reason}`);
}
console.log();

// Record decision outcome
engine.recordDecision(
  { type: 'rebalance', timestamp: Date.now() },
  { success: true, apyImprovement: 1.25 }
);

// Demonstrate leverage capability
console.log('Step 7: Leverage Strategy (Advanced)');
console.log('─────────────────────────────────────');
console.log('Aggressive strategy supports up to 3x leverage for amplified returns\n');

console.log('Example: Leveraged yield farming');
console.log('  Base position: 10,000 USDC');
console.log('  Supply APY: 8%');
console.log('  Borrow APY: 4%');
console.log('  Leverage: 2x\n');

const baseAPY = 8.0;
const borrowAPY = 4.0;
const leverage = 2.0;
const leveragedAPY = baseAPY + (leverage - 1) * (baseAPY - borrowAPY);

console.log(`  Unleveraged return: ${baseAPY}% APY`);
console.log(`  Leveraged return: ${leveragedAPY}% APY`);
console.log(`  APY improvement: ${(leveragedAPY - baseAPY).toFixed(2)}%\n`);

console.log('Safety considerations:');
console.log('  • Health factor maintained above 2.0');
console.log('  • Automatic deleveraging if health factor drops');
console.log('  • Liquidation protection through monitoring\n');

// Display performance metrics
console.log('Step 8: Performance Metrics');
console.log('─────────────────────────────────────');
const metrics = engine.getPerformanceMetrics();

console.log(`Strategy: ${metrics.strategyName}`);
console.log(`Total decisions: ${metrics.totalDecisions}`);
console.log(`Successful decisions: ${metrics.successfulDecisions}`);
console.log(`Failed decisions: ${metrics.failedDecisions}`);
console.log(`Success rate: ${metrics.successRate}`);
console.log(`Average APY improvement: ${metrics.averageAPYImprovement.toFixed(2)}%\n`);

// Display decision log
console.log('Step 9: Decision Audit Trail');
console.log('─────────────────────────────────────');
const decisionLog = engine.getDecisionLog({ limit: 5 });

console.log(`Recent decisions (last ${decisionLog.length}):`);
for (const entry of decisionLog) {
  const timestamp = new Date(entry.timestamp).toISOString();
  console.log(`  [${timestamp}] ${entry.type}`);
  if (entry.rationale) {
    console.log(`    ${entry.rationale}`);
  }
}
console.log();

// Summary
console.log('Summary: Aggressive Strategy Benefits');
console.log('═════════════════════════════════════');
console.log(' Maximum Returns: Access to all vetted protocols with highest yields');
console.log(' Leverage Support: Up to 3x leverage for amplified returns');
console.log(' Highly Responsive: 0.3% threshold captures small opportunities');
console.log(' Best Diversification: 30% max per protocol spreads risk');
console.log(' Quick Adaptation: Rapidly reallocates to emerging opportunities');
console.log(' Transparent: All decisions logged with rationale');
console.log(' Autonomous: Operates within defined risk parameters\n');

console.log('Risk management:');
console.log('  • Minimum risk score threshold (30) filters out very risky protocols');
console.log('  • 30% position limit prevents over-concentration');
console.log('  • Health factor monitoring for leveraged positions');
console.log('  • Diversification across multiple protocols\n');

console.log('Ideal for:');
console.log('  • Experienced DeFi users comfortable with higher risk');
console.log('  • Users seeking maximum returns');
console.log('  • Active portfolio management with frequent rebalancing');
console.log('  • Users who understand leverage and liquidation risks');
console.log('  • Portfolios that can absorb higher volatility\n');

console.log('Performance expectations:');
console.log('  • Higher APY than Conservative or Balanced strategies');
console.log('  • More frequent rebalancing (higher gas costs)');
console.log('  • Greater exposure to market volatility');
console.log('  • Potential for amplified returns through leverage\n');

console.log(' Aggressive Strategy Example Complete!');
