/**
 * Leverage Optimization Example
 * 
 * Demonstrates how to calculate optimal leverage ratios for maximizing returns
 * while maintaining safe health factors.
 * 
 * Requirements: 7.5, 12.2, 12.6
 */

import { PortfolioCalculator } from '../src/utils/portfolio-calculator.js';

console.log('═══════════════════════════════════════════════════════════');
console.log('  Leverage Optimization Example');
console.log('═══════════════════════════════════════════════════════════\n');

const calculator = new PortfolioCalculator();

// Example 1: Calculate optimal leverage for a good spread
console.log('Example 1: Optimal Leverage with Good Spread');
console.log('─────────────────────────────────────────────────────────\n');

const scenario1 = calculator.calculateOptimalLeverage({
  supplyAPY: 8.0,        // 8% supply APY
  borrowAPY: 3.0,        // 3% borrow APY
  maxLeverage: 3.0,      // User allows up to 3x leverage
  targetHealthFactor: 2.0, // Target health factor of 2.0
  minHealthFactor: 1.8,  // Minimum health factor of 1.8
  liquidationThreshold: 0.85, // 85% liquidation threshold
  collateralPrice: 2000  // ETH at $2000
});

console.log('Input Parameters:');
console.log(`  Supply APY: ${scenario1.baseAPY}%`);
console.log(`  Borrow APY: ${scenario1.borrowAPY}%`);
console.log(`  Spread: ${scenario1.spread}%`);
console.log(`  Max Leverage (User): ${scenario1.maxLeverageByUser}x`);
console.log(`  Target Health Factor: ${scenario1.targetHealthFactor}`);
console.log(`  Collateral Price: $${2000}\n`);

console.log('Optimal Leverage Analysis:');
console.log(`  Recommended Leverage: ${scenario1.optimalLeverage.toFixed(2)}x`);
console.log(`  Leveraged APY: ${scenario1.leveragedAPY.toFixed(2)}%`);
console.log(`  APY Improvement: +${scenario1.apyImprovement.toFixed(2)}%`);
console.log(`  Health Factor: ${scenario1.healthFactor.toFixed(2)}`);
console.log(`  Risk Level: ${scenario1.riskLevel}`);
console.log(`  Liquidation Price: $${scenario1.liquidationPrice.toFixed(2)}`);
console.log(`  Price Drop to Liquidation: ${scenario1.liquidationPriceDropPercentage.toFixed(2)}%\n`);

console.log('Recommendation:');
console.log(`  ${scenario1.recommendation.toUpperCase()}`);
console.log(`  ${scenario1.reason}\n`);

// Example 2: Negative spread - no leverage recommended
console.log('\nExample 2: Negative Spread - No Leverage');
console.log('─────────────────────────────────────────────────────────\n');

const scenario2 = calculator.calculateOptimalLeverage({
  supplyAPY: 3.0,        // 3% supply APY
  borrowAPY: 5.0,        // 5% borrow APY (higher than supply!)
  maxLeverage: 3.0,
  targetHealthFactor: 2.0
});

console.log('Input Parameters:');
console.log(`  Supply APY: ${scenario2.baseAPY}%`);
console.log(`  Borrow APY: ${scenario2.borrowAPY}%`);
console.log(`  Spread: ${scenario2.spread}% (NEGATIVE)\n`);

console.log('Analysis:');
console.log(`  Recommended Leverage: ${scenario2.optimalLeverage}x`);
console.log(`  Leveraged APY: ${scenario2.leveragedAPY}%`);
console.log(`  Recommendation: ${scenario2.recommendation}`);
console.log(`  Reason: ${scenario2.reason}\n`);

// Example 3: Compare multiple leverage scenarios
console.log('\nExample 3: Leverage Scenario Comparison');
console.log('─────────────────────────────────────────────────────────\n');

const scenarios = calculator.analyzeLeverageScenarios({
  supplyAPY: 10.0,
  borrowAPY: 4.0,
  liquidationThreshold: 0.85,
  minHealthFactor: 1.8,
  collateralPrice: 2000
}, [1.0, 1.5, 2.0, 2.5, 3.0]);

console.log('Comparing Different Leverage Ratios:\n');
console.log('Leverage | Leveraged APY | Health Factor | Liq. Price | Risk Level | Safe?');
console.log('─────────┼───────────────┼───────────────┼────────────┼────────────┼──────');

scenarios.forEach(s => {
  const liqPrice = s.liquidationPrice ? `$${s.liquidationPrice.toFixed(0)}` : 'N/A';
  console.log(
    `  ${s.leverage.toFixed(1)}x   │    ${s.leveragedAPY.toFixed(2)}%     │     ${s.healthFactor === Infinity ? '∞' : s.healthFactor.toFixed(2)}      │   ${liqPrice.padEnd(7)} │  ${s.riskLevel.padEnd(8)} │  ${s.isSafe ? '✓' : '✗'}`
  );
});

console.log('\nKey Insights:');
console.log('  • Higher leverage = Higher APY but lower health factor');
console.log('  • Only 1x and 1.5x leverage meet minimum health factor (1.8)');
console.log('  • 2x+ leverage is too risky and could lead to liquidation\n');

// Example 4: Calculate leveraged APY for specific leverage
console.log('\nExample 4: Calculate Leveraged APY for Specific Leverage');
console.log('─────────────────────────────────────────────────────────\n');

const leverage2x = calculator.calculateLeveragedAPY(8.0, 3.0, 2.0);

console.log('2x Leverage Calculation:');
console.log(`  Base APY: ${leverage2x.baseAPY}%`);
console.log(`  Borrow APY: ${leverage2x.borrowAPY}%`);
console.log(`  Leverage: ${leverage2x.leverage}x`);
console.log(`  Formula: (${leverage2x.baseAPY}% × ${leverage2x.leverage}) - (${leverage2x.borrowAPY}% × ${leverage2x.leverage - 1})`);
console.log(`  Leveraged APY: ${leverage2x.leveragedAPY}%`);
console.log(`  APY Improvement: +${leverage2x.apyImprovement}%`);
console.log(`  Profitable: ${leverage2x.isProfitable ? 'Yes' : 'No'}\n`);

// Example 5: Calculate liquidation price for existing position
console.log('\nExample 5: Liquidation Price for Existing Position');
console.log('─────────────────────────────────────────────────────────\n');

const liquidation = calculator.calculateLiquidationPrice({
  collateralAmount: 10,      // 10 ETH
  collateralPrice: 2000,     // $2000 per ETH
  borrowedAmount: 10000,     // $10,000 borrowed
  liquidationThreshold: 0.85 // 85% LTV
});

console.log('Position Details:');
console.log(`  Collateral: ${10} ETH @ $${2000} = $${liquidation.collateralValue.toLocaleString()}`);
console.log(`  Borrowed: $${liquidation.borrowedAmount.toLocaleString()}`);
console.log(`  Current Leverage: ${liquidation.leverage.toFixed(2)}x`);
console.log(`  Health Factor: ${liquidation.healthFactor.toFixed(2)}\n`);

console.log('Liquidation Analysis:');
console.log(`  Current Price: $${liquidation.currentPrice.toLocaleString()}`);
console.log(`  Liquidation Price: $${liquidation.liquidationPrice.toFixed(2)}`);
console.log(`  Price Drop to Liquidation: $${liquidation.priceDropToLiquidation.toFixed(2)} (${liquidation.priceDropPercentage.toFixed(2)}%)`);
console.log(`  At Risk: ${liquidation.isAtRisk ? 'YES ⚠️' : 'No ✓'}\n`);

// Example 6: Conservative vs Aggressive leverage strategies
console.log('\nExample 6: Conservative vs Aggressive Strategies');
console.log('─────────────────────────────────────────────────────────\n');

const conservative = calculator.calculateOptimalLeverage({
  supplyAPY: 8.0,
  borrowAPY: 3.0,
  maxLeverage: 1.5,          // Conservative: max 1.5x
  targetHealthFactor: 2.5,   // Conservative: higher health factor
  minHealthFactor: 2.0,
  liquidationThreshold: 0.85
});

const aggressive = calculator.calculateOptimalLeverage({
  supplyAPY: 8.0,
  borrowAPY: 3.0,
  maxLeverage: 3.0,          // Aggressive: max 3x
  targetHealthFactor: 1.9,   // Aggressive: lower health factor
  minHealthFactor: 1.8,
  liquidationThreshold: 0.85
});

console.log('Conservative Strategy:');
console.log(`  Max Leverage: ${conservative.maxLeverageByUser}x`);
console.log(`  Target Health Factor: ${conservative.targetHealthFactor}`);
console.log(`  Optimal Leverage: ${conservative.optimalLeverage.toFixed(2)}x`);
console.log(`  Leveraged APY: ${conservative.leveragedAPY.toFixed(2)}%`);
console.log(`  Health Factor: ${conservative.healthFactor.toFixed(2)}`);
console.log(`  Risk Level: ${conservative.riskLevel}\n`);

console.log('Aggressive Strategy:');
console.log(`  Max Leverage: ${aggressive.maxLeverageByUser}x`);
console.log(`  Target Health Factor: ${aggressive.targetHealthFactor}`);
console.log(`  Optimal Leverage: ${aggressive.optimalLeverage.toFixed(2)}x`);
console.log(`  Leveraged APY: ${aggressive.leveragedAPY.toFixed(2)}%`);
console.log(`  Health Factor: ${aggressive.healthFactor.toFixed(2)}`);
console.log(`  Risk Level: ${aggressive.riskLevel}\n`);

console.log('Comparison:');
console.log(`  APY Difference: ${(aggressive.leveragedAPY - conservative.leveragedAPY).toFixed(2)}%`);
console.log(`  Risk Trade-off: ${aggressive.riskLevel} vs ${conservative.riskLevel}`);
console.log(`  Recommendation: Choose based on your risk tolerance\n`);

// Example 7: Real-world scenario - Aave V3 ETH position
console.log('\nExample 7: Real-World Scenario - Aave V3 ETH');
console.log('─────────────────────────────────────────────────────────\n');

const aaveScenario = calculator.calculateOptimalLeverage({
  supplyAPY: 3.5,            // Current Aave V3 ETH supply APY
  borrowAPY: 2.8,            // Current Aave V3 ETH borrow APY
  maxLeverage: 2.5,
  targetHealthFactor: 2.0,
  minHealthFactor: 1.8,
  liquidationThreshold: 0.825, // Aave V3 ETH liquidation threshold
  collateralPrice: 2000
});

console.log('Aave V3 ETH Position:');
console.log(`  Supply APY: ${aaveScenario.baseAPY}%`);
console.log(`  Borrow APY: ${aaveScenario.borrowAPY}%`);
console.log(`  Spread: ${aaveScenario.spread}%`);
console.log(`  Liquidation Threshold: ${aaveScenario.liquidationThreshold * 100}%\n`);

console.log('Optimal Strategy:');
console.log(`  Recommended Leverage: ${aaveScenario.optimalLeverage.toFixed(2)}x`);
console.log(`  Leveraged APY: ${aaveScenario.leveragedAPY.toFixed(2)}%`);
console.log(`  APY Improvement: +${aaveScenario.apyImprovement.toFixed(2)}%`);
console.log(`  Health Factor: ${aaveScenario.healthFactor.toFixed(2)}`);
console.log(`  Liquidation Price: $${aaveScenario.liquidationPrice.toFixed(2)}`);
console.log(`  Safety Margin: ${aaveScenario.liquidationPriceDropPercentage.toFixed(2)}% price drop\n`);

console.log('Risk Assessment:');
console.log(`  Risk Level: ${aaveScenario.riskLevel}`);
console.log(`  Recommendation: ${aaveScenario.recommendation}`);
console.log(`  Reason: ${aaveScenario.reason}\n`);

console.log('═══════════════════════════════════════════════════════════');
console.log('  Key Takeaways');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('1. Leverage Optimization:');
console.log('   • Only use leverage when supply APY > borrow APY (positive spread)');
console.log('   • Higher spread = more profitable leverage opportunities');
console.log('   • Always respect health factor constraints (min 1.8, target 2.0+)\n');

console.log('2. Risk Management:');
console.log('   • Health factor is the key safety metric');
console.log('   • Lower health factor = higher liquidation risk');
console.log('   • Monitor liquidation price and maintain safety margin\n');

console.log('3. APY Calculation:');
console.log('   • Formula: Leveraged APY = (Supply APY × Leverage) - (Borrow APY × (Leverage - 1))');
console.log('   • Example: 8% supply, 3% borrow, 2x leverage = (8% × 2) - (3% × 1) = 13%');
console.log('   • APY improvement increases with leverage but so does risk\n');

console.log('4. Strategy Selection:');
console.log('   • Conservative: Lower leverage (1.5x), higher health factor (2.5+)');
console.log('   • Balanced: Moderate leverage (2x), target health factor (2.0)');
console.log('   • Aggressive: Higher leverage (3x), minimum health factor (1.8)\n');

console.log('5. Real-World Application:');
console.log('   • Always check current market rates before leveraging');
console.log('   • Monitor positions regularly and adjust as rates change');
console.log('   • Set up alerts for health factor drops below safe levels');
console.log('   • Consider gas costs when rebalancing leveraged positions\n');
