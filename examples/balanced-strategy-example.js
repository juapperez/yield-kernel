/**
 * Balanced Strategy Example
 * 
 * Demonstrates the Balanced investment strategy with:
 * - Established protocols with audits (not just blue-chip)
 * - Up to 1.5x leverage
 * - 0.5% APY rebalance threshold
 * - Max 40% per protocol
 * - Risk-return balance
 * 
 * Requirements: 4.1
 */

import { StrategyEngine, StrategyType } from '../src/strategy-engine.js';

console.log('  Balanced Strategy Example\n');
console.log('This example demonstrates a moderate-risk investment strategy');
console.log('that balances safety with higher returns from established protocols.\n');

// Initialize Strategy Engine
const engine = new StrategyEngine({
  riskFreeRate: 0.05 // 5% risk-free rate
});

// Set Balanced strategy
console.log('Step 1: Setting Balanced Strategy');
console.log('─────────────────────────────────────');
const strategy = engine.setStrategy(StrategyType.BALANCED);

console.log(`Strategy: ${strategy.name}`);
console.log(`Description: ${strategy.description}`);
console.log(`Risk Tolerance: ${strategy.riskTolerance}/100`);
console.log(`Max Leverage: ${strategy.maxLeverage}x (moderate borrowing)`);
console.log(`Rebalance Threshold: ${strategy.rebalanceThreshold}% APY improvement`);
console.log(`Max Position Size: ${strategy.maxPositionSize * 100}% per protocol`);
console.log(`Allowed Protocols: All established protocols with audits`);
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
console.log(`Eligible opportunities (after filtering): 4`);
console.log(`Positions allocated: ${allocation.positionCount}`);
console.log(`Total capital allocated: ${allocation.totalAllocated.toFixed(2)}%`);
console.log(`Expected portfolio APY: ${allocation.expectedAPY.toFixed(2)}%\n`);

console.log('Allocation breakdown:');
for (const [key, position] of allocation.positions) {
  console.log(`  ${position.protocol.padEnd(15)} ${position.asset.padEnd(6)} ${position.percentage.toFixed(2)}%  APY: ${position.expectedAPY.toFixed(2)}%`);
}
console.log();

console.log('Why these protocols?');
console.log('   Morpho: Highest APY (7.0%), established protocol with audits');
console.log('   Spark: Good APY (6.0%), MakerDAO-backed, strong security');
console.log('   Aave V3: Blue-chip protocol, excellent risk-adjusted returns');
console.log('   Compound V3: Established protocol, diversification benefit');
console.log('   Risky DeFi: Risk score too low (40 < 50 minimum)\n');

// Demonstrate leverage capability
console.log('Step 4: Leverage Capability');
console.log('─────────────────────────────────────');
console.log('Balanced strategy supports up to 1.5x leverage for amplified returns.\n');

console.log('Example leveraged position:');
console.log('  Supply: $10,000 USDC to Aave V3');
console.log('  Borrow: $5,000 USDC (50% LTV)');
console.log('  Re-supply: $5,000 USDC');
console.log('  Total position: $15,000 (1.5x leverage)');
console.log('  Supply APY: 5.5%');
console.log('  Borrow APY: 4.0%');
console.log('  Net APY: (15,000 × 5.5% - 5,000 × 4.0%) / 10,000 = 6.25%');
console.log('  APY improvement: +0.75% from leverage\n');

console.log('Safety measures:');
console.log('  • Health factor maintained above 2.5x');
console.log('  • Automatic deleveraging if health factor drops below 2.8x');
console.log('  • Liquidation protection through monitoring\n');

// Simulate market change - moderate opportunity arises
console.log('Step 5: Market Change - Evaluating Rebalancing');
console.log('─────────────────────────────────────');
console.log('Scenario: Spark APY increases from 6.0% to 6.8%\n');

const updatedYields = [
  {
    protocol: 'morpho',
    asset: 'USDC',
    totalAPY: 7.0,
    riskScore: 65,
    risk: 'medium'
  },
  {
    protocol: 'spark',
    asset: 'DAI',
    totalAPY: 6.8, // Increased
    riskScore: 75,
    risk: 'medium'
  },
  {
    protocol: 'aave-v3',
    asset: 'USDC',
    totalAPY: 5.5,
    riskScore: 85,
    risk: 'low'
  }
];

const newAllocation = engine.calculateOptimalAllocation(currentPositions, updatedYields);

console.log('Current allocation APY: 6.20%');
console.log('New optimal allocation APY: 6.75%');
console.log('APY improvement: 0.55%\n');

// Check if rebalancing is recommended
const rebalanceDecision = engine.shouldRebalance(
  { expectedAPY: 6.20 },
  { expectedAPY: 6.75 }
);

console.log(`Should rebalance? ${rebalanceDecision.shouldRebalance ? 'YES' : 'NO'}`);
console.log(`Reason: ${rebalanceDecision.rationale}`);
console.log(`Threshold: ${rebalanceDecision.threshold}% (Balanced requires 0.5%)`);
console.log(`Improvement: ${rebalanceDecision.apyImprovement.toFixed(2)}%\n`);

if (rebalanceDecision.shouldRebalance) {
  // Create rebalancing plan
  const fromAllocation = {
    positions: new Map([
      ['morpho:USDC', { protocol: 'morpho', asset: 'USDC', amount: 4000 }],
      ['spark:DAI', { protocol: 'spark', asset: 'DAI', amount: 3000 }],
      ['aave-v3:USDC', { protocol: 'aave-v3', asset: 'USDC', amount: 3000 }]
    ])
  };
  
  const toAllocation = {
    positions: new Map([
      ['morpho:USDC', { protocol: 'morpho', asset: 'USDC', amount: 4000 }],
      ['spark:DAI', { protocol: 'spark', asset: 'DAI', amount: 4000 }],
      ['aave-v3:USDC', { protocol: 'aave-v3', asset: 'USDC', amount: 2000 }]
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
    { success: true, apyImprovement: 0.55 }
  );
}

// Demonstrate smaller change that doesn't trigger rebalancing
console.log('Step 6: Smaller Market Change - No Rebalancing');
console.log('─────────────────────────────────────');
console.log('Scenario: Aave V3 APY increases from 5.5% to 5.8%\n');

const smallChangeDecision = engine.shouldRebalance(
  { expectedAPY: 6.75 },
  { expectedAPY: 7.05 }
);

console.log(`Should rebalance? ${smallChangeDecision.shouldRebalance ? 'YES' : 'NO'}`);
console.log(`Reason: ${smallChangeDecision.rationale}`);
console.log(`Improvement: ${smallChangeDecision.apyImprovement.toFixed(2)}%`);
console.log(`Note: 0.3% improvement is below 0.5% threshold\n`);

// Display performance metrics
console.log('Step 7: Performance Metrics');
console.log('─────────────────────────────────────');
const metrics = engine.getPerformanceMetrics();

console.log(`Strategy: ${metrics.strategyName}`);
console.log(`Total decisions: ${metrics.totalDecisions}`);
console.log(`Successful decisions: ${metrics.successfulDecisions}`);
console.log(`Failed decisions: ${metrics.failedDecisions}`);
console.log(`Success rate: ${metrics.successRate}`);
console.log(`Average APY improvement: ${metrics.averageAPYImprovement.toFixed(2)}%\n`);

// Display decision log
console.log('Step 8: Decision Audit Trail');
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

// Compare with Conservative strategy
console.log('Step 9: Comparison with Conservative Strategy');
console.log('─────────────────────────────────────');
console.log('Balanced vs Conservative:\n');

console.log('Protocols:');
console.log('  Conservative: Aave V3, Compound V3 only (blue-chip)');
console.log('  Balanced: All established protocols with audits \n');

console.log('Leverage:');
console.log('  Conservative: 1.0x (no borrowing)');
console.log('  Balanced: Up to 1.5x (moderate borrowing) \n');

console.log('Rebalancing:');
console.log('  Conservative: 1.0% threshold (less frequent)');
console.log('  Balanced: 0.5% threshold (more responsive) \n');

console.log('Position Size:');
console.log('  Conservative: Max 50% per protocol');
console.log('  Balanced: Max 40% per protocol (better diversification) \n');

console.log('Expected Returns:');
console.log('  Conservative: 3-7% APY');
console.log('  Balanced: 5-12% APY (higher potential) \n');

console.log('Risk Level:');
console.log('  Conservative: Very Low');
console.log('  Balanced: Medium (acceptable for moderate risk tolerance) \n');

// Summary
console.log('Summary: Balanced Strategy Benefits');
console.log('═════════════════════════════════════');
console.log(' Risk-Return Balance: Optimizes for both safety and returns');
console.log(' Broader Protocol Access: Established protocols beyond blue-chip');
console.log(' Moderate Leverage: Up to 1.5x for amplified returns');
console.log(' Responsive Rebalancing: 0.5% threshold captures opportunities');
console.log(' Better Diversification: Max 40% per protocol reduces concentration');
console.log(' Higher Returns: 5-12% APY range vs 3-7% Conservative');
console.log(' Transparent: All decisions logged with rationale');
console.log(' Autonomous: Operates within defined risk parameters\n');

console.log('Ideal for:');
console.log('  • Moderate risk tolerance investors');
console.log('  • Users seeking balance between safety and returns');
console.log('  • Portfolios $10,000 - $100,000');
console.log('  • Medium-term holders (6-24 months)');
console.log('  • Users comfortable with established DeFi protocols\n');

console.log('Risk considerations:');
console.log('  • Leverage risk: 1.5x leverage increases liquidation risk');
console.log('  • Protocol risk: Broader protocol set than Conservative');
console.log('  • Market risk: More frequent rebalancing = more exposure');
console.log('  • Gas costs: More rebalancing = higher transaction costs\n');

console.log(' Balanced Strategy Example Complete!');
