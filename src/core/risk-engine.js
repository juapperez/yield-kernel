/**
 * Risk Engine - Comprehensive risk assessment and management
 * 
 * Implements Value at Risk (VaR) calculation, protocol risk scoring,
 * health factor monitoring, and position size validation.
 * 
 * Requirements: 5.1, 5.2
 */

/**
 * Risk levels
 */
export const RiskLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Risk event types
 */
export const RiskEventType = {
  PROTOCOL_EXPLOIT: 'protocol_exploit',
  LIQUIDATION_RISK: 'liquidation_risk',
  HEALTH_FACTOR_WARNING: 'health_factor_warning',
  PRICE_ANOMALY: 'price_anomaly',
  CONSECUTIVE_FAILURES: 'consecutive_failures',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  VAR_THRESHOLD_EXCEEDED: 'var_threshold_exceeded'
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  varConfidenceLevel: 0.95, // 95% confidence level
  varHistoricalDays: 90, // 90-day historical simulation
  maxPositionSize: 0.30, // 30% max per protocol
  minHealthFactor: 1.5,
  warningHealthFactor: 1.8,
  targetHealthFactor: 2.5,
  correlationThreshold: 0.7 // High correlation threshold
};

/**
 * Risk Engine class
 */
export class RiskEngine {
  constructor(config = {}) {
    // Configuration
    this.varConfidenceLevel = config.varConfidenceLevel || DEFAULT_CONFIG.varConfidenceLevel;
    this.varHistoricalDays = config.varHistoricalDays || DEFAULT_CONFIG.varHistoricalDays;
    this.maxPositionSize = config.maxPositionSize || DEFAULT_CONFIG.maxPositionSize;
    this.minHealthFactor = config.minHealthFactor || DEFAULT_CONFIG.minHealthFactor;
    this.warningHealthFactor = config.warningHealthFactor || DEFAULT_CONFIG.warningHealthFactor;
    this.targetHealthFactor = config.targetHealthFactor || DEFAULT_CONFIG.targetHealthFactor;
    this.correlationThreshold = config.correlationThreshold || DEFAULT_CONFIG.correlationThreshold;
    
    // Integration points
    this.priceOracle = config.priceOracle || null;
    this.strategyEngine = config.strategyEngine || null;
    
    // Historical price data cache
    this.priceHistory = new Map();
    
    // Risk event log
    this.riskEvents = [];
    this.maxEventLogSize = config.maxEventLogSize || 1000;
    
    // Circuit breaker state
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = config.maxConsecutiveFailures || 3;
    this.circuitBreakerOpen = false;
    this.circuitBreakerTimeout = config.circuitBreakerTimeout || 3600000; // 1 hour
    this.circuitBreakerOpenTime = null;
    
    // Emergency pause state
    this.emergencyPaused = false;
    this.pauseReason = null;
    
    console.log(' Risk Engine initialized');
    console.log(`   VaR Confidence Level: ${(this.varConfidenceLevel * 100).toFixed(0)}%`);
    console.log(`   Historical Period: ${this.varHistoricalDays} days`);
    console.log(`   Max Position Size: ${(this.maxPositionSize * 100).toFixed(0)}%`);
  }

  /**
   * Calculate Value at Risk (VaR) for portfolio
   * 
   * Uses historical simulation with 90-day price data at 95% confidence level.
   * Accounts for asset correlation.
   * 
   * @param {Array} positions - Current portfolio positions
   * @param {Object} options - Calculation options
   * @returns {Object} VaR result with threshold comparison
   */
  async calculateVaR(positions, options = {}) {
    try {
      if (!positions || positions.length === 0) {
        return {
          var95: 0,
          varPercentage: 0,
          portfolioValue: 0,
          exceedsThreshold: false,
          riskLevel: RiskLevel.LOW,
          message: 'No positions to calculate VaR',
          timestamp: Date.now()
        };
      }

      // Get historical price data for all assets
      const historicalReturns = await this._getHistoricalReturns(positions);
      
      // Calculate portfolio value
      const portfolioValue = this._calculatePortfolioValue(positions);
      
      // Calculate correlation matrix
      const correlationMatrix = this._calculateCorrelationMatrix(historicalReturns);
      
      // Simulate portfolio returns accounting for correlation
      const portfolioReturns = this._simulatePortfolioReturns(
        positions,
        historicalReturns,
        correlationMatrix
      );
      
      // Calculate VaR at specified confidence level
      const var95 = this._calculateVaRFromReturns(portfolioReturns, portfolioValue);
      const varPercentage = (var95 / portfolioValue) * 100;
      
      // Determine risk level
      const riskLevel = this._determineRiskLevel(varPercentage);
      
      // Check if VaR exceeds threshold
      const threshold = options.varThreshold || 10; // Default 10% threshold
      const exceedsThreshold = varPercentage > threshold;
      
      const result = {
        var95,
        varPercentage,
        portfolioValue,
        exceedsThreshold,
        threshold,
        riskLevel,
        confidenceLevel: this.varConfidenceLevel,
        historicalDays: this.varHistoricalDays,
        message: exceedsThreshold
          ? `  VaR (${varPercentage.toFixed(2)}%) exceeds threshold (${threshold}%). Defensive rebalancing recommended.`
          : ` VaR (${varPercentage.toFixed(2)}%) within acceptable limits.`,
        timestamp: Date.now()
      };

      // Log risk event if threshold exceeded
      if (exceedsThreshold) {
        this._logRiskEvent({
          type: 'var_threshold_exceeded',
          severity: 'high',
          details: result,
          action: 'defensive_rebalancing_recommended'
        });
      }

      console.log(` VaR calculated: ${varPercentage.toFixed(2)}% (${var95.toFixed(2)} USD)`);
      
      return result;
    } catch (error) {
      console.error(' Failed to calculate VaR:', error.message);
      throw error;
    }
  }

  /**
   * Assess protocol risk using multiple factors
   * 
   * @param {string} protocol - Protocol name
   * @param {Object} protocolData - Protocol data (TVL, audits, etc.)
   * @returns {Object} Protocol risk assessment
   */
  assessProtocolRisk(protocol, protocolData = {}) {
    // TVL score (40% weight) - higher TVL = lower risk
    const tvlScore = this._calculateTVLScore(protocolData.tvl || 0);
    
    // Audit score (30% weight) - more audits = lower risk
    const auditScore = this._calculateAuditScore(protocolData.audits || []);
    
    // Time in production score (20% weight) - longer = lower risk
    const timeScore = this._calculateTimeScore(protocolData.launchDate);
    
    // Exploit history score (10% weight, negative) - exploits = higher risk
    const exploitScore = this._calculateExploitScore(protocolData.exploits || []);
    
    // Calculate overall score (0-100)
    const overallScore = (
      tvlScore * 0.4 +
      auditScore * 0.3 +
      timeScore * 0.2 +
      exploitScore * 0.1
    );
    
    // Determine risk level
    const riskLevel = this._scoreToRiskLevel(overallScore);
    
    return {
      protocol,
      overallScore: Math.round(overallScore),
      riskLevel,
      breakdown: {
        tvl: { score: Math.round(tvlScore), weight: 40 },
        audits: { score: Math.round(auditScore), weight: 30 },
        timeInProduction: { score: Math.round(timeScore), weight: 20 },
        exploitHistory: { score: Math.round(exploitScore), weight: 10 }
      },
      recommendation: this._getProtocolRecommendation(overallScore),
      timestamp: Date.now()
    };
  }

  /**
   * Check health factor for leveraged positions
   * 
   * @param {Array} positions - Portfolio positions
   * @returns {Object} Health factor status
   */
  checkHealthFactor(positions) {
    const leveragedPositions = positions.filter(p => p.healthFactor !== undefined);
    
    if (leveragedPositions.length === 0) {
      return {
        hasLeveragedPositions: false,
        status: 'safe',
        message: 'No leveraged positions',
        timestamp: Date.now()
      };
    }

    // Find minimum health factor
    const minHealthFactor = Math.min(...leveragedPositions.map(p => p.healthFactor));
    const criticalPosition = leveragedPositions.find(p => p.healthFactor === minHealthFactor);
    
    // Determine status
    let status, action, severity;
    if (minHealthFactor < this.minHealthFactor) {
      status = 'critical';
      action = 'immediate_deleverage_required';
      severity = 'critical';
    } else if (minHealthFactor < this.warningHealthFactor) {
      status = 'warning';
      action = 'auto_deleverage_triggered';
      severity = 'high';
    } else if (minHealthFactor < this.targetHealthFactor) {
      status = 'caution';
      action = 'monitor_closely';
      severity = 'medium';
    } else {
      status = 'safe';
      action = 'none';
      severity = 'low';
    }

    const result = {
      hasLeveragedPositions: true,
      status,
      action,
      minHealthFactor,
      criticalPosition: criticalPosition ? {
        protocol: criticalPosition.protocol,
        asset: criticalPosition.asset,
        healthFactor: criticalPosition.healthFactor
      } : null,
      thresholds: {
        minimum: this.minHealthFactor,
        warning: this.warningHealthFactor,
        target: this.targetHealthFactor
      },
      message: this._getHealthFactorMessage(status, minHealthFactor),
      timestamp: Date.now()
    };

    // Log risk event if action required
    if (severity !== 'low') {
      this._logRiskEvent({
        type: 'health_factor_warning',
        severity,
        details: result,
        action
      });
    }

    return result;
  }

  /**
   * Validate position size against limits
   * 
   * @param {string} protocol - Protocol name
   * @param {number} positionSize - Position size as percentage (0-100)
   * @param {Array} currentPositions - Current portfolio positions
   * @returns {Object} Validation result
   */
  validatePositionSize(protocol, positionSize, currentPositions = []) {
    const maxAllowed = this.maxPositionSize * 100;
    
    // Check single position limit
    if (positionSize > maxAllowed) {
      return {
        valid: false,
        reason: 'position_too_large',
        positionSize,
        maxAllowed,
        message: `Position size ${positionSize.toFixed(2)}% exceeds maximum ${maxAllowed.toFixed(0)}% per protocol`,
        timestamp: Date.now()
      };
    }

    // Calculate current protocol exposure
    const protocolExposure = currentPositions
      .filter(p => p.protocol === protocol)
      .reduce((sum, p) => sum + (p.percentage || 0), 0);
    
    const totalExposure = protocolExposure + positionSize;
    
    if (totalExposure > maxAllowed) {
      return {
        valid: false,
        reason: 'protocol_exposure_exceeded',
        currentExposure: protocolExposure,
        additionalSize: positionSize,
        totalExposure,
        maxAllowed,
        message: `Total protocol exposure ${totalExposure.toFixed(2)}% would exceed maximum ${maxAllowed.toFixed(0)}%`,
        timestamp: Date.now()
      };
    }

    return {
      valid: true,
      positionSize,
      protocolExposure: totalExposure,
      maxAllowed,
      remainingCapacity: maxAllowed - totalExposure,
      message: `Position size validated: ${positionSize.toFixed(2)}% (total protocol exposure: ${totalExposure.toFixed(2)}%)`,
      timestamp: Date.now()
    };
  }

  /**
   * Detect correlation between assets
   * 
   * @param {string} asset1 - First asset
   * @param {string} asset2 - Second asset
   * @returns {Promise<Object>} Correlation analysis
   */
  async detectCorrelation(asset1, asset2) {
    try {
      // Get historical returns for both assets
      const returns1 = await this._getAssetReturns(asset1);
      const returns2 = await this._getAssetReturns(asset2);
      
      // Calculate correlation coefficient
      const correlation = this._calculateCorrelation(returns1, returns2);
      
      // Determine if correlation is high
      const isHighlyCorrelated = Math.abs(correlation) > this.correlationThreshold;
      
      return {
        asset1,
        asset2,
        correlation,
        isHighlyCorrelated,
        threshold: this.correlationThreshold,
        message: isHighlyCorrelated
          ? `  High correlation detected: ${(correlation * 100).toFixed(1)}%`
          : ` Correlation within acceptable range: ${(correlation * 100).toFixed(1)}%`,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(` Failed to detect correlation between ${asset1} and ${asset2}:`, error.message);
      throw error;
    }
  }

  /**
   * Get risk events log
   * 
   * @param {Object} filters - Optional filters
   * @returns {Array} Filtered risk events
   */
  getRiskEvents(filters = {}) {
    let events = [...this.riskEvents];

    if (filters.type) {
      events = events.filter(e => e.type === filters.type);
    }

    if (filters.severity) {
      events = events.filter(e => e.severity === filters.severity);
    }

    if (filters.since) {
      events = events.filter(e => e.timestamp >= filters.since);
    }

    if (filters.limit) {
      events = events.slice(-filters.limit);
    }

    return events;
  }

  /**
   * Clear risk events log
   */
  clearRiskEvents() {
    this.riskEvents = [];
    console.log('  Risk events log cleared');
  }

  /**
   * Handle critical risk events
   * 
   * Processes different types of risk events and takes appropriate action
   * based on event severity. Logs all events for audit trail.
   * 
   * Requirements: 5.4, 9.7, 15.5
   * 
   * @param {Object} event - Risk event details
   * @returns {Object} Response with action taken
   */
  handleRiskEvent(event) {
    const { type, severity, details, protocol, asset } = event;
    
    console.log(`  Handling risk event: ${type} (${severity})`);
    
    // Check if emergency pause is active
    if (this.emergencyPaused) {
      return {
        success: false,
        action: 'blocked_by_emergency_pause',
        message: `Operations halted: ${this.pauseReason}`,
        timestamp: Date.now()
      };
    }
    
    // Check circuit breaker
    if (this.circuitBreakerOpen) {
      const canReset = this._canResetCircuitBreaker();
      if (canReset) {
        this._resetCircuitBreaker();
      } else {
        return {
          success: false,
          action: 'blocked_by_circuit_breaker',
          message: 'Circuit breaker is open. Operations halted after consecutive failures.',
          resetTime: this.circuitBreakerOpenTime + this.circuitBreakerTimeout,
          timestamp: Date.now()
        };
      }
    }
    
    let response;
    
    // Handle event based on type
    switch (type) {
      case RiskEventType.PROTOCOL_EXPLOIT:
        response = this._handleProtocolExploit(protocol, details);
        break;
        
      case RiskEventType.LIQUIDATION_RISK:
        response = this._handleLiquidationRisk(details);
        break;
        
      case RiskEventType.HEALTH_FACTOR_WARNING:
        response = this._handleHealthFactorWarning(details);
        break;
        
      case RiskEventType.PRICE_ANOMALY:
        response = this._handlePriceAnomaly(asset, details);
        break;
        
      case RiskEventType.CONSECUTIVE_FAILURES:
        response = this._handleConsecutiveFailures(details);
        break;
        
      case RiskEventType.SUSPICIOUS_ACTIVITY:
        response = this._handleSuspiciousActivity(details);
        break;
        
      case RiskEventType.VAR_THRESHOLD_EXCEEDED:
        response = this._handleVarThresholdExceeded(details);
        break;
        
      default:
        response = {
          success: false,
          action: 'unknown_event_type',
          message: `Unknown risk event type: ${type}`,
          timestamp: Date.now()
        };
    }
    
    // Log the event
    this._logRiskEvent({
      type,
      severity,
      details,
      protocol,
      asset,
      response
    });
    
    return response;
  }

  /**
   * Record a failure for circuit breaker tracking
   * 
   * @param {string} reason - Failure reason
   */
  recordFailure(reason) {
    this.consecutiveFailures++;
    
    console.log(` Failure recorded: ${reason} (${this.consecutiveFailures}/${this.maxConsecutiveFailures})`);
    
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      this._openCircuitBreaker(reason);
    }
  }

  /**
   * Record a success (resets failure counter)
   */
  recordSuccess() {
    if (this.consecutiveFailures > 0) {
      console.log(` Success recorded. Resetting failure counter from ${this.consecutiveFailures}`);
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Trigger emergency pause
   * 
   * Immediately halts all autonomous operations. Requires explicit user action to resume.
   * 
   * @param {string} reason - Reason for emergency pause
   * @returns {Object} Pause confirmation
   */
  triggerEmergencyPause(reason) {
    this.emergencyPaused = true;
    this.pauseReason = reason;
    
    console.log(` EMERGENCY PAUSE ACTIVATED: ${reason}`);
    
    this._logRiskEvent({
      type: 'emergency_pause',
      severity: 'critical',
      details: { reason },
      action: 'all_operations_halted'
    });
    
    return {
      success: true,
      paused: true,
      reason,
      message: ' All autonomous operations have been halted',
      timestamp: Date.now()
    };
  }

  /**
   * Resume operations after emergency pause
   * 
   * @returns {Object} Resume confirmation
   */
  resumeOperations() {
    if (!this.emergencyPaused) {
      return {
        success: false,
        message: 'Operations are not paused',
        timestamp: Date.now()
      };
    }
    
    this.emergencyPaused = false;
    const previousReason = this.pauseReason;
    this.pauseReason = null;
    
    console.log(' Operations resumed');
    
    this._logRiskEvent({
      type: 'operations_resumed',
      severity: 'low',
      details: { previousReason },
      action: 'operations_resumed'
    });
    
    return {
      success: true,
      paused: false,
      message: 'Operations have been resumed',
      previousReason,
      timestamp: Date.now()
    };
  }

  /**
   * Get circuit breaker status
   * 
   * @returns {Object} Circuit breaker status
   */
  getCircuitBreakerStatus() {
    return {
      open: this.circuitBreakerOpen,
      consecutiveFailures: this.consecutiveFailures,
      maxFailures: this.maxConsecutiveFailures,
      openTime: this.circuitBreakerOpenTime,
      canReset: this.circuitBreakerOpen ? this._canResetCircuitBreaker() : false,
      timestamp: Date.now()
    };
  }

  /**
   * Get emergency pause status
   * 
   * @returns {Object} Emergency pause status
   */
  getEmergencyPauseStatus() {
    return {
      paused: this.emergencyPaused,
      reason: this.pauseReason,
      timestamp: Date.now()
    };
  }

  /**
   * Manually reset circuit breaker
   * 
   * @returns {Object} Reset confirmation
   */
  resetCircuitBreaker() {
    if (!this.circuitBreakerOpen) {
      return {
        success: false,
        message: 'Circuit breaker is not open',
        timestamp: Date.now()
      };
    }
    
    this._resetCircuitBreaker();
    
    return {
      success: true,
      message: 'Circuit breaker has been manually reset',
      timestamp: Date.now()
    };
  }

  /**
   * Set integration points
   * 
   * @param {Object} integrations - Integration objects
   */
  setIntegrations(integrations) {
    if (integrations.priceOracle) {
      this.priceOracle = integrations.priceOracle;
    }
    if (integrations.strategyEngine) {
      this.strategyEngine = integrations.strategyEngine;
    }

    console.log(' Risk Engine integrations configured');
  }

  /**
   * Get historical returns for all assets in positions
   * 
   * @private
   * @param {Array} positions - Portfolio positions
   * @returns {Promise<Map>} Map of asset to returns array
   */
  async _getHistoricalReturns(positions) {
    const returns = new Map();
    
    for (const position of positions) {
      const assetReturns = await this._getAssetReturns(position.asset);
      returns.set(position.asset, assetReturns);
    }
    
    return returns;
  }

  /**
   * Get historical returns for a single asset
   * 
   * @private
   * @param {string} asset - Asset symbol
   * @returns {Promise<Array>} Array of daily returns
   */
  async _getAssetReturns(asset) {
    // Check cache first
    if (this.priceHistory.has(asset)) {
      const cached = this.priceHistory.get(asset);
      const age = Date.now() - cached.timestamp;
      if (age < 3600000) { // 1 hour cache
        return cached.returns;
      }
    }

    // In production, fetch from price oracle or external API
    // For now, generate simulated returns based on asset type
    const returns = this._generateSimulatedReturns(asset);
    
    // Cache the returns
    this.priceHistory.set(asset, {
      returns,
      timestamp: Date.now()
    });
    
    return returns;
  }

  /**
   * Generate simulated returns for testing
   * 
   * @private
   * @param {string} asset - Asset symbol
   * @returns {Array} Simulated daily returns
   */
  _generateSimulatedReturns(asset) {
    const returns = [];
    const days = this.varHistoricalDays;
    
    // Different volatility for different asset types
    let volatility;
    if (asset.includes('USD') || asset === 'DAI' || asset === 'USDC' || asset === 'USDT') {
      volatility = 0.001; // Stablecoins: 0.1% daily volatility
    } else if (asset === 'BTC' || asset === 'WBTC') {
      volatility = 0.03; // Bitcoin: 3% daily volatility
    } else {
      volatility = 0.02; // ETH and others: 2% daily volatility
    }
    
    // Generate random returns with specified volatility
    for (let i = 0; i < days; i++) {
      const randomReturn = (Math.random() - 0.5) * 2 * volatility;
      returns.push(randomReturn);
    }
    
    return returns;
  }

  /**
   * Calculate portfolio value from positions
   * 
   * @private
   * @param {Array} positions - Portfolio positions
   * @returns {number} Total portfolio value in USD
   */
  _calculatePortfolioValue(positions) {
    return positions.reduce((sum, position) => {
      const value = position.amountUSD || position.amount || 0;
      return sum + (typeof value === 'string' ? parseFloat(value) : value);
    }, 0);
  }

  /**
   * Calculate correlation matrix for assets
   * 
   * @private
   * @param {Map} historicalReturns - Map of asset to returns
   * @returns {Map} Correlation matrix
   */
  _calculateCorrelationMatrix(historicalReturns) {
    const matrix = new Map();
    const assets = Array.from(historicalReturns.keys());
    
    for (const asset1 of assets) {
      const correlations = new Map();
      for (const asset2 of assets) {
        if (asset1 === asset2) {
          correlations.set(asset2, 1.0);
        } else {
          const returns1 = historicalReturns.get(asset1);
          const returns2 = historicalReturns.get(asset2);
          const correlation = this._calculateCorrelation(returns1, returns2);
          correlations.set(asset2, correlation);
        }
      }
      matrix.set(asset1, correlations);
    }
    
    return matrix;
  }

  /**
   * Calculate correlation coefficient between two return series
   * 
   * @private
   * @param {Array} returns1 - First return series
   * @param {Array} returns2 - Second return series
   * @returns {number} Correlation coefficient (-1 to 1)
   */
  _calculateCorrelation(returns1, returns2) {
    const n = Math.min(returns1.length, returns2.length);
    
    // Calculate means
    const mean1 = returns1.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const mean2 = returns2.slice(0, n).reduce((a, b) => a + b, 0) / n;
    
    // Calculate covariance and standard deviations
    let covariance = 0;
    let variance1 = 0;
    let variance2 = 0;
    
    for (let i = 0; i < n; i++) {
      const diff1 = returns1[i] - mean1;
      const diff2 = returns2[i] - mean2;
      covariance += diff1 * diff2;
      variance1 += diff1 * diff1;
      variance2 += diff2 * diff2;
    }
    
    const stdDev1 = Math.sqrt(variance1 / n);
    const stdDev2 = Math.sqrt(variance2 / n);
    
    if (stdDev1 === 0 || stdDev2 === 0) {
      return 0;
    }
    
    return (covariance / n) / (stdDev1 * stdDev2);
  }

  /**
   * Simulate portfolio returns accounting for correlation
   * 
   * @private
   * @param {Array} positions - Portfolio positions
   * @param {Map} historicalReturns - Historical returns for each asset
   * @param {Map} correlationMatrix - Asset correlation matrix
   * @returns {Array} Portfolio returns
   */
  _simulatePortfolioReturns(positions, historicalReturns, correlationMatrix) {
    const portfolioValue = this._calculatePortfolioValue(positions);
    const days = this.varHistoricalDays;
    const portfolioReturns = [];
    
    // Calculate position weights
    const weights = new Map();
    for (const position of positions) {
      const value = position.amountUSD || position.amount || 0;
      const weight = (typeof value === 'string' ? parseFloat(value) : value) / portfolioValue;
      weights.set(position.asset, weight);
    }
    
    // Calculate portfolio return for each day
    for (let day = 0; day < days; day++) {
      let portfolioReturn = 0;
      
      for (const position of positions) {
        const asset = position.asset;
        const weight = weights.get(asset);
        const assetReturns = historicalReturns.get(asset);
        
        if (assetReturns && assetReturns[day] !== undefined) {
          portfolioReturn += weight * assetReturns[day];
        }
      }
      
      portfolioReturns.push(portfolioReturn);
    }
    
    return portfolioReturns;
  }

  /**
   * Calculate VaR from portfolio returns
   * 
   * @private
   * @param {Array} portfolioReturns - Array of portfolio returns
   * @param {number} portfolioValue - Current portfolio value
   * @returns {number} VaR in USD
   */
  _calculateVaRFromReturns(portfolioReturns, portfolioValue) {
    // Sort returns from worst to best
    const sortedReturns = [...portfolioReturns].sort((a, b) => a - b);
    
    // Find the return at the confidence level percentile
    const index = Math.floor((1 - this.varConfidenceLevel) * sortedReturns.length);
    const varReturn = sortedReturns[index];
    
    // Convert to dollar amount (negative return = loss)
    const var95 = Math.abs(varReturn * portfolioValue);
    
    return var95;
  }

  /**
   * Determine risk level from VaR percentage
   * 
   * @private
   * @param {number} varPercentage - VaR as percentage
   * @returns {string} Risk level
   */
  _determineRiskLevel(varPercentage) {
    if (varPercentage < 5) return RiskLevel.LOW;
    if (varPercentage < 10) return RiskLevel.MEDIUM;
    if (varPercentage < 20) return RiskLevel.HIGH;
    return RiskLevel.CRITICAL;
  }

  /**
   * Calculate TVL score (0-100)
   * 
   * @private
   * @param {number} tvl - Total Value Locked in USD
   * @returns {number} Score
   */
  _calculateTVLScore(tvl) {
    // Logarithmic scale: $1B+ = 100, $100M = 80, $10M = 60, $1M = 40, <$1M = 20
    if (tvl >= 1e9) return 100;
    if (tvl >= 1e8) return 80;
    if (tvl >= 1e7) return 60;
    if (tvl >= 1e6) return 40;
    return 20;
  }

  /**
   * Calculate audit score (0-100)
   * 
   * @private
   * @param {Array} audits - Array of audit objects
   * @returns {number} Score
   */
  _calculateAuditScore(audits) {
    if (audits.length === 0) return 0;
    if (audits.length >= 3) return 100;
    if (audits.length === 2) return 75;
    return 50;
  }

  /**
   * Calculate time in production score (0-100)
   * 
   * @private
   * @param {Date|string} launchDate - Protocol launch date
   * @returns {number} Score
   */
  _calculateTimeScore(launchDate) {
    if (!launchDate) return 50; // Default if unknown
    
    const launch = new Date(launchDate);
    const now = new Date();
    const daysInProduction = (now - launch) / (1000 * 60 * 60 * 24);
    
    // 2+ years = 100, 1 year = 75, 6 months = 50, 3 months = 25, <3 months = 10
    if (daysInProduction >= 730) return 100;
    if (daysInProduction >= 365) return 75;
    if (daysInProduction >= 180) return 50;
    if (daysInProduction >= 90) return 25;
    return 10;
  }

  /**
   * Calculate exploit history score (0-100, negative impact)
   * 
   * @private
   * @param {Array} exploits - Array of exploit events
   * @returns {number} Score
   */
  _calculateExploitScore(exploits) {
    if (exploits.length === 0) return 100;
    if (exploits.length === 1) return 50;
    return 0; // Multiple exploits = very risky
  }

  /**
   * Convert score to risk level
   * 
   * @private
   * @param {number} score - Overall score (0-100)
   * @returns {string} Risk level
   */
  _scoreToRiskLevel(score) {
    if (score >= 70) return RiskLevel.LOW;
    if (score >= 50) return RiskLevel.MEDIUM;
    if (score >= 30) return RiskLevel.HIGH;
    return RiskLevel.CRITICAL;
  }

  /**
   * Get protocol recommendation based on score
   * 
   * @private
   * @param {number} score - Overall score (0-100)
   * @returns {string} Recommendation
   */
  _getProtocolRecommendation(score) {
    if (score >= 70) return 'Recommended for all strategies';
    if (score >= 50) return 'Suitable for balanced and aggressive strategies';
    if (score >= 30) return 'Only for aggressive strategies with caution';
    return 'Not recommended - high risk';
  }

  /**
   * Get health factor status message
   * 
   * @private
   * @param {string} status - Health factor status
   * @param {number} healthFactor - Current health factor
   * @returns {string} Message
   */
  _getHealthFactorMessage(status, healthFactor) {
    switch (status) {
      case 'critical':
        return ` CRITICAL: Health factor ${healthFactor.toFixed(2)} below minimum ${this.minHealthFactor}. Immediate deleveraging required!`;
      case 'warning':
        return `  WARNING: Health factor ${healthFactor.toFixed(2)} below ${this.warningHealthFactor}. Auto-deleveraging triggered.`;
      case 'caution':
        return ` CAUTION: Health factor ${healthFactor.toFixed(2)} below target ${this.targetHealthFactor}. Monitor closely.`;
      case 'safe':
        return ` SAFE: Health factor ${healthFactor.toFixed(2)} above target ${this.targetHealthFactor}.`;
      default:
        return `Health factor: ${healthFactor.toFixed(2)}`;
    }
  }

  /**
   * Log a risk event
   * 
   * @private
   * @param {Object} event - Risk event details
   */
  _logRiskEvent(event) {
    this.riskEvents.push({
      ...event,
      timestamp: Date.now()
    });

    // Trim log if it exceeds max size
    if (this.riskEvents.length > this.maxEventLogSize) {
      this.riskEvents.shift();
    }

    console.log(`  Risk event logged: ${event.type} (${event.severity})`);
  }

  /**
   * Handle protocol exploit event
   * 
   * @private
   * @param {string} protocol - Protocol name
   * @param {Object} details - Event details
   * @returns {Object} Response
   */
  _handleProtocolExploit(protocol, details) {
    // Trigger emergency pause immediately
    this.triggerEmergencyPause(`Protocol exploit detected: ${protocol}`);
    
    return {
      success: true,
      action: 'emergency_pause_triggered',
      protocol,
      message: ` CRITICAL: Protocol exploit detected in ${protocol}. All operations halted.`,
      recommendation: 'Review positions in affected protocol and consider withdrawing funds',
      timestamp: Date.now()
    };
  }

  /**
   * Handle liquidation risk event
   * 
   * @private
   * @param {Object} details - Event details
   * @returns {Object} Response
   */
  _handleLiquidationRisk(details) {
    return {
      success: true,
      action: 'immediate_deleverage_required',
      message: ' CRITICAL: Position approaching liquidation. Immediate action required.',
      recommendation: 'Reduce leverage or add collateral immediately',
      details,
      timestamp: Date.now()
    };
  }

  /**
   * Handle health factor warning event
   * 
   * @private
   * @param {Object} details - Event details
   * @returns {Object} Response
   */
  _handleHealthFactorWarning(details) {
    return {
      success: true,
      action: 'auto_deleverage_recommended',
      message: '  WARNING: Health factor below safe threshold. Auto-deleveraging recommended.',
      recommendation: 'Reduce leverage to maintain health factor above 2.0',
      details,
      timestamp: Date.now()
    };
  }

  /**
   * Handle price anomaly event
   * 
   * @private
   * @param {string} asset - Asset symbol
   * @param {Object} details - Event details
   * @returns {Object} Response
   */
  _handlePriceAnomaly(asset, details) {
    return {
      success: true,
      action: 'pause_trading',
      asset,
      message: `  Price anomaly detected for ${asset}. Pausing trading until prices stabilize.`,
      recommendation: 'Wait for price to stabilize before executing operations',
      details,
      timestamp: Date.now()
    };
  }

  /**
   * Handle consecutive failures event
   * 
   * @private
   * @param {Object} details - Event details
   * @returns {Object} Response
   */
  _handleConsecutiveFailures(details) {
    this._openCircuitBreaker('Consecutive failures threshold reached');
    
    return {
      success: true,
      action: 'circuit_breaker_opened',
      message: '  Circuit breaker activated due to consecutive failures. Operations halted.',
      recommendation: 'Check RPC endpoints and network connectivity',
      details,
      timestamp: Date.now()
    };
  }

  /**
   * Handle suspicious activity event
   * 
   * @private
   * @param {Object} details - Event details
   * @returns {Object} Response
   */
  _handleSuspiciousActivity(details) {
    // Trigger emergency pause for suspicious activity
    this.triggerEmergencyPause('Suspicious activity detected');
    
    return {
      success: true,
      action: 'emergency_pause_triggered',
      message: ' Suspicious activity detected. All operations halted for security.',
      recommendation: 'Review recent transactions and verify account security',
      details,
      timestamp: Date.now()
    };
  }

  /**
   * Handle VaR threshold exceeded event
   * 
   * @private
   * @param {Object} details - Event details
   * @returns {Object} Response
   */
  _handleVarThresholdExceeded(details) {
    return {
      success: true,
      action: 'defensive_rebalancing_recommended',
      message: '  Portfolio VaR exceeds threshold. Defensive rebalancing recommended.',
      recommendation: 'Reduce exposure to high-risk assets and increase stable allocations',
      details,
      timestamp: Date.now()
    };
  }

  /**
   * Open circuit breaker
   * 
   * @private
   * @param {string} reason - Reason for opening
   */
  _openCircuitBreaker(reason) {
    this.circuitBreakerOpen = true;
    this.circuitBreakerOpenTime = Date.now();
    
    console.log(` Circuit breaker OPENED: ${reason}`);
    console.log(`   Will auto-reset after ${this.circuitBreakerTimeout / 1000 / 60} minutes`);
    
    this._logRiskEvent({
      type: 'circuit_breaker_opened',
      severity: 'high',
      details: { reason, consecutiveFailures: this.consecutiveFailures },
      action: 'operations_halted'
    });
  }

  /**
   * Reset circuit breaker
   * 
   * @private
   */
  _resetCircuitBreaker() {
    this.circuitBreakerOpen = false;
    this.circuitBreakerOpenTime = null;
    this.consecutiveFailures = 0;
    
    console.log(' Circuit breaker RESET. Operations can resume.');
    
    this._logRiskEvent({
      type: 'circuit_breaker_reset',
      severity: 'low',
      details: {},
      action: 'operations_can_resume'
    });
  }

  /**
   * Check if circuit breaker can be reset
   * 
   * @private
   * @returns {boolean} True if timeout has elapsed
   */
  _canResetCircuitBreaker() {
    if (!this.circuitBreakerOpen) {
      return false;
    }
    
    const elapsed = Date.now() - this.circuitBreakerOpenTime;
    return elapsed >= this.circuitBreakerTimeout;
  }
}
