/**
 * Risk Engine Example
 * 
 * Demonstrates how to use the Risk Engine for portfolio risk management.
 */

import { RiskEngine, RiskLevel } from '../src/risk-engine.js';

console.log(' Risk Engine Example - Portfolio Risk Management\n');

// Initialize Risk Engine with custom configuration
const riskEngine = new RiskEngine({
  varConfidenceLevel: 0.95,
  varHistoricalDays: 90,
  maxPositionSize: 0.30,
  minHealthFactor: 1.5,
  warningHealthFactor: 1.8,
  targetHealthFactor: 2.5
});

// Example portfolio with diversified positions
const portfolio = [
  {
    protocol: 'aave-v3',
    asset: 'USDC',
    amount: '50000',
    amountUSD: 50000,
    apy: 5.2,
    type: 'supplied',
    healthFactor: 3.5
  },
  {
    protocol: 'compound-v3',
    asset: 'ETH',
    amount: '20',
    amountUSD: 60000,
    apy: 3.8,
    type: 'supplied',
    healthFactor: 2.8
  },
  {
    protocol: 'spark',
    asset: 'WBTC',
    amount: '2',
    amountUSD: 90000,
    apy: 4.5,
    type: 'supplied',
    healthFactor: 2.2
  }
];

console.log(' Portfolio Overview:');
console.log('  Total Value: $200,000');
console.log('  Positions: 3');
console.log('  Protocols: Aave V3, Compound V3, Spark\n');

// Step 1: Calculate VaR
console.log('=== Step 1: Calculate Value at Risk (VaR) ===\n');

const varResult = await riskEngine.calculateVaR(portfolio, {
  varThreshold: 10 // 10% threshold
});

console.log(`Portfolio Value: $${varResult.portfolioValue.toLocaleString()}`);
console.log(`VaR (95% confidence): $${varResult.var95.toLocaleString()}`);
console.log(`VaR Percentage: ${varResult.varPercentage.toFixed(2)}%`);
console.log(`Risk Level: ${varResult.riskLevel.toUpperCase()}`);
console.log(`Threshold: ${varResult.threshold}%`);
console.log(`Status: ${varResult.exceedsThreshold ? '  EXCEEDS THRESHOLD' : ' WITHIN LIMITS'}\n`);

if (varResult.exceedsThreshold) {
  console.log(' Action: Defensive rebalancing recommended\n');
}

// Step 2: Assess Protocol Risk
console.log('=== Step 2: Assess Protocol Risk ===\n');

const protocols = [
  {
    name: 'aave-v3',
    data: {
      tvl: 5e9,
      audits: [
        { auditor: 'Trail of Bits', date: '2022-01-01' },
        { auditor: 'OpenZeppelin', date: '2022-06-01' },
        { auditor: 'Certora', date: '2023-01-01' }
      ],
      launchDate: '2021-03-01',
      exploits: []
    }
  },
  {
    name: 'compound-v3',
    data: {
      tvl: 3e9,
      audits: [
        { auditor: 'OpenZeppelin', date: '2022-08-01' },
        { auditor: 'ChainSecurity', date: '2023-01-01' }
      ],
      launchDate: '2022-08-01',
      exploits: []
    }
  },
  {
    name: 'spark',
    data: {
      tvl: 1e9,
      audits: [
        { auditor: 'ABDK', date: '2023-05-01' }
      ],
      launchDate: '2023-05-01',
      exploits: []
    }
  }
];

for (const protocol of protocols) {
  const risk = riskEngine.assessProtocolRisk(protocol.name, protocol.data);
  console.log(`${protocol.name.toUpperCase()}:`);
  console.log(`  Score: ${risk.overallScore}/100`);
  console.log(`  Risk Level: ${risk.riskLevel.toUpperCase()}`);
  console.log(`  Recommendation: ${risk.recommendation}`);
  console.log();
}

// Step 3: Check Health Factors
console.log('=== Step 3: Monitor Health Factors ===\n');

const healthCheck = riskEngine.checkHealthFactor(portfolio);

console.log(`Leveraged Positions: ${healthCheck.hasLeveragedPositions ? 'Yes' : 'No'}`);
console.log(`Status: ${healthCheck.status.toUpperCase()}`);
console.log(`Min Health Factor: ${healthCheck.minHealthFactor.toFixed(2)}`);

if (healthCheck.criticalPosition) {
  console.log(`Critical Position:`);
  console.log(`  Protocol: ${healthCheck.criticalPosition.protocol}`);
  console.log(`  Asset: ${healthCheck.criticalPosition.asset}`);
  console.log(`  Health Factor: ${healthCheck.criticalPosition.healthFactor.toFixed(2)}`);
}

console.log(`\nThresholds:`);
console.log(`  Minimum: ${healthCheck.thresholds.minimum}`);
console.log(`  Warning: ${healthCheck.thresholds.warning}`);
console.log(`  Target: ${healthCheck.thresholds.target}`);

console.log(`\n${healthCheck.message}\n`);

if (healthCheck.action !== 'none') {
  console.log(` Action Required: ${healthCheck.action}\n`);
}

// Step 4: Validate New Position
console.log('=== Step 4: Validate New Position ===\n');

console.log('Attempting to add 25% position to Aave V3...');

const currentAavePositions = portfolio.filter(p => p.protocol === 'aave-v3');
const validation = riskEngine.validatePositionSize('aave-v3', 25, currentAavePositions);

console.log(`Valid: ${validation.valid ? ' YES' : ' NO'}`);
console.log(`Position Size: ${validation.positionSize}%`);
console.log(`Max Allowed: ${validation.maxAllowed}%`);

if (validation.valid) {
  console.log(`Protocol Exposure: ${validation.protocolExposure.toFixed(2)}%`);
  console.log(`Remaining Capacity: ${validation.remainingCapacity.toFixed(2)}%`);
} else {
  console.log(`Reason: ${validation.reason}`);
}

console.log(`\n${validation.message}\n`);

// Step 5: Check Asset Correlation
console.log('=== Step 5: Analyze Asset Correlation ===\n');

const correlationPairs = [
  ['ETH', 'WBTC'],
  ['ETH', 'USDC'],
  ['WBTC', 'USDC']
];

for (const [asset1, asset2] of correlationPairs) {
  const correlation = await riskEngine.detectCorrelation(asset1, asset2);
  console.log(`${asset1}-${asset2}:`);
  console.log(`  Correlation: ${(correlation.correlation * 100).toFixed(1)}%`);
  console.log(`  Highly Correlated: ${correlation.isHighlyCorrelated ? '  YES' : ' NO'}`);
  console.log();
}

// Step 6: Review Risk Events
console.log('=== Step 6: Risk Events Summary ===\n');

const riskEvents = riskEngine.getRiskEvents();
console.log(`Total Risk Events: ${riskEvents.length}`);

if (riskEvents.length > 0) {
  console.log('\nRecent Events:');
  riskEvents.slice(-5).forEach((event, index) => {
    console.log(`  ${index + 1}. ${event.type} (${event.severity})`);
    console.log(`     Action: ${event.action}`);
    console.log(`     Time: ${new Date(event.timestamp).toLocaleString()}`);
  });
}

console.log('\n Risk Engine Example Complete!\n');

// Summary
console.log('=== Risk Management Summary ===\n');
console.log('The Risk Engine provides:');
console.log('   Value at Risk (VaR) calculation with 95% confidence');
console.log('   Protocol risk scoring based on TVL, audits, and history');
console.log('   Health factor monitoring for leveraged positions');
console.log('   Position size validation and exposure limits');
console.log('   Asset correlation detection');
console.log('   Comprehensive risk event logging\n');

console.log('Use the Risk Engine to:');
console.log('  • Monitor portfolio risk continuously');
console.log('  • Trigger defensive rebalancing when needed');
console.log('  • Prevent over-concentration in protocols');
console.log('  • Protect leveraged positions from liquidation');
console.log('  • Maintain diversification across assets');
console.log('  • Handle critical risk events automatically');
console.log('  • Implement circuit breakers for failure protection');
console.log('  • Enable emergency pause for security incidents\n');

console.log(' See examples/risk-event-handling-example.js for advanced');
console.log('   risk event handling, circuit breaker, and emergency pause features.\n');
