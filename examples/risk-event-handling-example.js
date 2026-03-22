/**
 * Risk Event Handling Example
 * 
 * Demonstrates how to use the Risk Engine's event handling,
 * circuit breaker, and emergency pause mechanisms.
 * 
 * Requirements: 5.4, 9.7, 15.5
 */

import { RiskEngine, RiskEventType } from '../src/risk-engine.js';

console.log('  Risk Event Handling Example\n');

// Initialize Risk Engine with custom circuit breaker settings
const riskEngine = new RiskEngine({
  maxConsecutiveFailures: 3,
  circuitBreakerTimeout: 3600000, // 1 hour
  minHealthFactor: 1.5,
  warningHealthFactor: 1.8
});

console.log('=== Scenario 1: Monitoring Health Factor ===\n');

// Simulate monitoring a leveraged position
const positions = [
  {
    protocol: 'aave-v3',
    asset: 'ETH',
    amount: '10',
    healthFactor: 1.7, // Below warning threshold
    type: 'supplied'
  }
];

const healthCheck = riskEngine.checkHealthFactor(positions);
console.log(`Health Factor Status: ${healthCheck.status}`);
console.log(`Action Required: ${healthCheck.action}`);
console.log(`${healthCheck.message}\n`);

// If health factor is concerning, handle the event
if (healthCheck.status === 'warning' || healthCheck.status === 'critical') {
  const response = riskEngine.handleRiskEvent({
    type: RiskEventType.HEALTH_FACTOR_WARNING,
    severity: healthCheck.status === 'critical' ? 'critical' : 'high',
    details: healthCheck
  });
  
  console.log(`Event Handled: ${response.action}`);
  console.log(`Recommendation: ${response.recommendation}\n`);
}

console.log('=== Scenario 2: Handling RPC Failures with Circuit Breaker ===\n');

// Simulate a series of RPC failures
console.log('Attempting operations with failing RPC...');

for (let i = 1; i <= 4; i++) {
  console.log(`\nAttempt ${i}:`);
  
  // Simulate RPC call failure
  const rpcFailed = Math.random() > 0.3; // 70% failure rate
  
  if (rpcFailed) {
    riskEngine.recordFailure(`RPC call timeout (attempt ${i})`);
    
    const cbStatus = riskEngine.getCircuitBreakerStatus();
    console.log(`   RPC failed - Failures: ${cbStatus.consecutiveFailures}/${cbStatus.maxFailures}`);
    
    if (cbStatus.open) {
      console.log('   Circuit breaker opened! Operations halted.');
      break;
    }
  } else {
    riskEngine.recordSuccess();
    console.log('   RPC succeeded - Failure counter reset');
  }
}

// Check circuit breaker status
const cbStatus = riskEngine.getCircuitBreakerStatus();
if (cbStatus.open) {
  console.log('\n  Circuit breaker is open. Waiting for timeout or manual reset...');
  console.log(`   Consecutive failures: ${cbStatus.consecutiveFailures}`);
  console.log(`   Can auto-reset: ${cbStatus.canReset}`);
  
  // Manual reset (in production, this would be after investigation)
  console.log('\n Manually resetting circuit breaker after investigation...');
  const resetResult = riskEngine.resetCircuitBreaker();
  console.log(`   ${resetResult.message}\n`);
}

console.log('=== Scenario 3: Protocol Exploit Detection ===\n');

// Simulate detecting a protocol exploit
console.log('  Monitoring system detected unusual activity in protocol...');

const exploitEvent = {
  type: RiskEventType.PROTOCOL_EXPLOIT,
  severity: 'critical',
  protocol: 'vulnerable-defi-protocol',
  details: {
    exploitType: 'flash_loan_attack',
    estimatedLoss: 5000000,
    affectedUsers: 150,
    detectedAt: new Date().toISOString()
  }
};

const exploitResponse = riskEngine.handleRiskEvent(exploitEvent);
console.log(`Action Taken: ${exploitResponse.action}`);
console.log(`${exploitResponse.message}`);
console.log(`Recommendation: ${exploitResponse.recommendation}\n`);

// Check emergency pause status
const pauseStatus = riskEngine.getEmergencyPauseStatus();
console.log('Emergency Pause Status:');
console.log(`  Paused: ${pauseStatus.paused}`);
console.log(`  Reason: ${pauseStatus.reason}\n`);

// Try to execute an operation while paused
console.log('Attempting to rebalance portfolio while paused...');
const blockedResponse = riskEngine.handleRiskEvent({
  type: RiskEventType.VAR_THRESHOLD_EXCEEDED,
  severity: 'high',
  details: { varPercentage: 12 }
});

console.log(`Result: ${blockedResponse.action}`);
console.log(`${blockedResponse.message}\n`);

// Resume operations after investigation
console.log(' After investigation, resuming operations...');
const resumeResult = riskEngine.resumeOperations();
console.log(`${resumeResult.message}\n`);

console.log('=== Scenario 4: Price Anomaly Detection ===\n');

// Simulate price anomaly detection
const priceAnomalyEvent = {
  type: RiskEventType.PRICE_ANOMALY,
  severity: 'medium',
  asset: 'ETH',
  details: {
    currentPrice: 2500,
    expectedPrice: 2000,
    deviation: 25,
    source: 'chainlink'
  }
};

const priceResponse = riskEngine.handleRiskEvent(priceAnomalyEvent);
console.log(`Asset: ${priceResponse.asset}`);
console.log(`Action: ${priceResponse.action}`);
console.log(`${priceResponse.message}`);
console.log(`Recommendation: ${priceResponse.recommendation}\n`);

console.log('=== Scenario 5: Suspicious Activity Detection ===\n');

// Simulate suspicious activity
const suspiciousEvent = {
  type: RiskEventType.SUSPICIOUS_ACTIVITY,
  severity: 'critical',
  details: {
    activityType: 'rapid_transaction_pattern',
    transactionCount: 50,
    timeWindow: '5 minutes',
    normalRate: '5 per hour'
  }
};

const suspiciousResponse = riskEngine.handleRiskEvent(suspiciousEvent);
console.log(`Action: ${suspiciousResponse.action}`);
console.log(`${suspiciousResponse.message}`);
console.log(`Recommendation: ${suspiciousResponse.recommendation}\n`);

// Resume after verification
riskEngine.resumeOperations();

console.log('=== Scenario 6: Risk Event Audit Trail ===\n');

// Get all risk events
const allEvents = riskEngine.getRiskEvents();
console.log(`Total Events Logged: ${allEvents.length}\n`);

// Get critical events only
const criticalEvents = riskEngine.getRiskEvents({ severity: 'critical' });
console.log(`Critical Events: ${criticalEvents.length}`);
criticalEvents.forEach((event, index) => {
  console.log(`  ${index + 1}. ${event.type}`);
  console.log(`     Severity: ${event.severity}`);
  if (event.protocol) console.log(`     Protocol: ${event.protocol}`);
  if (event.response) console.log(`     Action: ${event.response.action}`);
});

console.log('\n=== Scenario 7: Manual Emergency Pause ===\n');

// User can manually trigger emergency pause
console.log('User initiating manual emergency pause for maintenance...');
const manualPause = riskEngine.triggerEmergencyPause('Scheduled maintenance and security audit');
console.log(`${manualPause.message}`);
console.log(`Reason: ${manualPause.reason}\n`);

// Resume after maintenance
console.log('Maintenance complete. Resuming operations...');
const maintenanceResume = riskEngine.resumeOperations();
console.log(`${maintenanceResume.message}\n`);

console.log('=== Best Practices ===\n');
console.log('1. Monitor circuit breaker status regularly');
console.log('2. Set up alerts for critical risk events');
console.log('3. Review risk event logs daily');
console.log('4. Test emergency pause procedures');
console.log('5. Document all manual interventions');
console.log('6. Adjust thresholds based on experience');
console.log('7. Keep audit trail for compliance\n');

console.log(' Risk Event Handling example completed!\n');
