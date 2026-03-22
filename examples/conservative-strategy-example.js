/**
 * Conservative Strategy Example
 * 
 * Demonstrates the Conservative investment strategy with:
 * - Blue-chip protocols only (Aave V3, Compound V3)
 * - No leverage (1.0x)
 * - 1.0% APY rebalance threshold
 * - Max 50% per protocol
 * - Safety prioritization
 * 
 * Requirements: 4.1, 13.2
 */

import { StrategyEngine, StrategyType } from '../src/strategy-engine.js';

console.log('  Conservative Strategy Example\n');
console.log('This example demonstrates a risk-averse investment strategy');
console.log('that prioritizes safety and stable returns from established protocols.\n');

// Initialize Strategy Engine
const engine = new StrategyEngine({
  riskFreeRate: 0.05 // 5% risk-free rate
});

// Set Conservative strategy
console.log('Step 1: Setting Conservative Strategy');
console.log('─────────────────────────────────────');
const strategy = engine.setStrategy(StrategyType.CONSERVATIVE);

console.log(`Strategy: ${strategy.name}`);
console.log(`Description: ${strategy.description}`);
console.log(`Risk Tolerance: ${strategy.riskTolerance}/100`);
console.log(`Max Leverage: ${strategy.maxLeverage}x (no borrowing)`);
console.log(`Rebalance Threshold: ${strategy.rebalanceThreshold}% APY improvement`);
console.log(`Max Position Size: ${strategy.maxPositionSize * 100}% per protocol`);
console.log(`Allowed Protocols: ${strategy.allowedProtocols.join(', ')}`);
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
    supplyAPY: 5.0,
    incentiveAPY: 1.0,
    totalAPY: 6.0,
    liquidity: 50000000,
    riskScore: 75,
    risk: 'medium'
  },
  {
    protocol: 'morpho',
    asset: 'USDC',
    supplyAPY: 6.5,
    incentiveAPY: 0.5,
    totalAPY: 7.0,
    liquidity: 30000000,
    riskScore: 65,
    risk: 'medium'
  },
  {
    protocol: 'risky-defi',
    asset: 'USDC',
    supplyAPY: 12.0,
    incentiveAPY: 3.0,
    totalAPY: 15.0,
    liquidity: 5000000,
    riskScore: 40,
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
console.log(`Eligible opportunities (after filtering): 2`);
console.log(`Positions allocated: ${allocation.positionCount}`);
console.log(`Total capital allocated: ${allocation.totalAllocated.toFixed(2)}%`);
console.log(`Expected portfolio APY: ${allocation.expectedAPY.toFixed(2)}%\n`);

console.log('Allocation breakdown:');
for (const [key, position] of allocation.positions) {
  console.log(`  ${position.protocol.padEnd(15)} ${position.asset.padEnd(6)} ${position.percentage.toFixed(2)}%  APY: ${position.expectedAPY.toFixed(2)}%`);
}
console.log();

console.log('Why these protocols?');
console.log('   Aave V3: Blue-chip protocol with highest TVL and security');
console.log('   Compound V3: Established protocol with strong track record');
console.log('   Spark: Not in blue-chip whitelist (Conservative only)');
console.log('   Morpho: Not in blue-chip whitelist (Conservative only)');
console.log('   Risky DeFi: High risk score, not suitable for Conservative\n');

// Simulate market change - new opportunity arises
console.log('Step 4: Market Change - Evaluating Rebalancing');
console.log('─────────────────────────────────────');
console.log('Scenario: Aave V3 APY increases from 5.5% to 6.8%\n');

const updatedYields = [
  {
    protocol: 'aave-v3',
    asset: 'USDC',
    totalAPY: 6.8, // Increased
    riskScore: 85,
    risk: 'low'
  },
  {
    protocol: 'compound-v3',
    asset: 'USDC',
    totalAPY: 5.2,
    riskScore: 80,
    risk: 'low'
  }
];

const newAllocation = engine.calculateOptimalAllocation(currentPositions, updatedYields);

console.log('Current allocation APY: 5.35%');
console.log('New optimal allocation APY: 6.00%');
console.log('APY improvement: 0.65%\n');

// Check if rebalancing is recommended
const rebalanceDecision = engine.shouldRebalance(
  { expectedAPY: 5.35 },
  { expectedAPY: 6.00 }
);

console.log(`Should rebalance? ${rebalanceDecision.shouldRebalance ? 'NO' : 'NO'}`);
console.log(`Reason: ${rebalanceDecision.rationale}`);
console.log(`Threshold: ${rebalanceDecision.threshold}% (Conservative requires 1.0%)`);
console.log(`Improvement: ${rebalanceDecision.apyImprovement.toFixed(2)}%\n`);

// Simulate larger market change that triggers rebalancing
console.log('Step 5: Larger Market Change - Triggering Rebalance');
console.log('─────────────────────────────────────');
console.log('Scenario: Compound V3 APY drops to 3.0%, Aave V3 stays at 6.8%\n');

const rebalanceDecision2 = engine.shouldRebalance(
  { expectedAPY: 5.35 },
  { expectedAPY: 6.80 }
);

console.log(`Should rebalance? ${rebalanceDecision2.shouldRebalance ? 'YES' : 'NO'}`);
console.log(`Reason: ${rebalanceDecision2.rationale}`);
console.log(`Improvement: ${rebalanceDecision2.apyImprovement.toFixed(2)}%\n`);

if (rebalanceDecision2.shouldRebalance) {
  // Create rebalancing plan
  const fromAllocation = {
    positions: new Map([
      ['aave-v3:USDC', { protocol: 'aave-v3', asset: 'USDC', amount: 5000 }],
      ['compound-v3:USDC', { protocol: 'compound-v3', asset: 'USDC', amount: 5000 }]
    ])
  };
  
  const toAllocation = {
    positions: new Map([
      ['aave-v3:USDC', { protocol: 'aave-v3', asset: 'USDC', amount: 7500 }],
      ['compound-v3:USDC', { protocol: 'compound-v3', asset: 'USDC', amount: 2500 }]
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
    { success: true, apyImprovement: 1.45 }
  );
}

// Display performance metrics
console.log('Step 6: Performance Metrics');
console.log('─────────────────────────────────────');
const metrics = engine.getPerformanceMetrics();

console.log(`Strategy: ${metrics.strategyName}`);
console.log(`Total decisions: ${metrics.totalDecisions}`);
console.log(`Successful decisions: ${metrics.successfulDecisions}`);
console.log(`Failed decisions: ${metrics.failedDecisions}`);
console.log(`Success rate: ${metrics.successRate}`);
console.log(`Average APY improvement: ${metrics.averageAPYImprovement.toFixed(2)}%\n`);

// Display decision log
console.log('Step 7: Decision Audit Trail');
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
console.log('Summary: Conservative Strategy Benefits');
console.log('═════════════════════════════════════');
console.log(' Safety First: Only blue-chip protocols (Aave V3, Compound V3)');
console.log(' No Leverage: 1.0x leverage eliminates liquidation risk');
console.log(' Stable Returns: Predictable yields from established protocols');
console.log(' Conservative Rebalancing: 1.0% threshold prevents excessive trading');
console.log(' Diversification: Max 50% per protocol reduces concentration risk');
console.log(' Transparent: All decisions logged with rationale');
console.log(' Autonomous: Operates within defined risk parameters\n');

console.log('Ideal for:');
console.log('  • Risk-averse investors');
console.log('  • Large portfolios requiring stability');
console.log('  • Long-term holders prioritizing capital preservation');
console.log('  • Users new to DeFi seeking safe entry point\n');

console.log(' Conservative Strategy Example Complete!');
