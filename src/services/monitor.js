// Portfolio Monitoring and Autonomous Rebalancing
import { createLogger } from '../utils/logger.js';

export class PortfolioMonitor {
  constructor(defiManager, riskManager) {
    this.defiManager = defiManager;
    this.riskManager = riskManager;
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.log = createLogger({ service: 'yieldkernel-monitor' });
  }

  async startMonitoring(intervalMinutes = 1440) {
    if (this.isMonitoring) {
      this.log.warn('monitor.already_active');
      return;
    }

    this.log.info('monitor.start', { intervalMinutes });
    this.isMonitoring = true;

    // Initial check
    await this.checkPortfolio();

    // Set up periodic checks
    this.monitoringInterval = setInterval(
      () => this.checkPortfolio(),
      intervalMinutes * 60 * 1000
    );
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    this.log.info('monitor.stop');
  }

  async checkPortfolio() {
    try {
      // Get current positions
      const positions = await this.defiManager.getAavePositions();
      
      // Get available yields
      const yields = await this.defiManager.getAvailableYields();
      
      // Generate risk report
      const riskReport = this.riskManager.generateRiskReport(
        positions.supplied,
        yields
      );

      this.log.info('monitor.snapshot', {
        totalSuppliedUSD: positions?.totalSuppliedUSD,
        overallRisk: riskReport?.overallRisk,
        recommendationsCount: riskReport?.recommendations?.length || 0
      });
      
      if (riskReport.recommendations.length > 0) {
        this.log.info('monitor.recommendations', { recommendations: riskReport.recommendations });
      }

      // Check if rebalancing is needed
      const optimalAllocation = this.calculateOptimalAllocation(yields);
      const currentAllocation = this.getCurrentAllocation(positions.supplied);
      
      const rebalanceCheck = this.riskManager.shouldRebalance(
        currentAllocation,
        optimalAllocation
      );

      if (rebalanceCheck.shouldRebalance) {
        this.log.warn('monitor.rebalance.needed', rebalanceCheck);
        await this.proposeRebalance(rebalanceCheck);
      } else {
        this.log.info('monitor.rebalance.not_needed');
      }

      return {
        positions,
        yields,
        riskReport,
        rebalanceCheck
      };
    } catch (error) {
      this.log.error('monitor.error', { error: { name: error?.name, message: error?.message } });
    }
  }

  calculateOptimalAllocation(yields) {
    // Simple strategy: allocate to highest APY within risk limits
    const allocation = {};
    
    const sortedYields = yields
      .filter(y => y.risk === 'low')
      .sort((a, b) => b.supplyAPY - a.supplyAPY);

    if (sortedYields.length > 0) {
      // For demo: suggest 100% in best yield
      allocation[sortedYields[0].asset] = 100;
    }

    return allocation;
  }

  getCurrentAllocation(positions) {
    const allocation = {};
    const total = positions.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    for (const position of positions) {
      const amount = parseFloat(position.amount || 0);
      allocation[position.asset] = total > 0 ? (amount / total * 100) : 0;
    }

    return allocation;
  }

  async proposeRebalance(rebalanceCheck) {
    this.log.info('monitor.rebalance.proposal', rebalanceCheck);
    
    // In production: execute rebalance after confirmation
    // 1. Withdraw from current position
    // 2. Supply to new optimal position
    // 3. Log transaction
  }

  async getPortfolioSummary() {
    const positions = await this.defiManager.getAavePositions();
    const yields = await this.defiManager.getAvailableYields();
    
    return {
      totalValue: positions.totalSuppliedUSD,
      positions: positions.supplied,
      availableYields: yields,
      healthFactor: positions.healthFactor,
      timestamp: new Date().toISOString()
    };
  }
}
