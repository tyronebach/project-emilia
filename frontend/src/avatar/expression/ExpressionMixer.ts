/**
 * Expression Mixer
 * Priority-based blending of facial expressions from multiple sources.
 * Higher priority channels override lower for the same expression.
 */

import type { VRMExpressionManager } from '@pixiv/three-vrm';

export interface ExpressionChannel {
  name: string;
  priority: number;
  expressions: Map<string, number>;  // expressionName → weight (0-1)
  enabled: boolean;
}

// Default channel priorities
export const CHANNEL_PRIORITY = {
  lipsync: 100,
  emotion: 80,
  blink: 60,
  gesture: 40,
  clip: 20,
} as const;

export class ExpressionMixer {
  private channels: Map<string, ExpressionChannel> = new Map();
  private finalValues: Map<string, number> = new Map();
  private appliedExpressions: Set<string> = new Set();
  private expressionManager: VRMExpressionManager | null = null;

  // Pre-sorted channel cache (avoids per-frame Array.from + filter + sort)
  private _sortedChannels: ExpressionChannel[] = [];
  private _channelsDirty: boolean = false;

  // Reusable set (avoids per-frame new Set())
  private _setByHigher: Set<string> = new Set();

  // Double-buffer for appliedExpressions (avoids per-frame new Set())
  private _prevApplied: Set<string> = new Set();

  /**
   * Set the VRM expression manager to apply values to
   */
  setExpressionManager(manager: VRMExpressionManager): void {
    this.expressionManager = manager;
  }

  /**
   * Create or get an expression channel
   */
  createChannel(name: string, priority: number): ExpressionChannel {
    let channel = this.channels.get(name);
    if (!channel) {
      channel = {
        name,
        priority,
        expressions: new Map(),
        enabled: true,
      };
      this.channels.set(name, channel);
      this._channelsDirty = true;
    }
    return channel;
  }

  /**
   * Get an existing channel
   */
  getChannel(name: string): ExpressionChannel | undefined {
    return this.channels.get(name);
  }

  /**
   * Set expression value for a channel
   */
  setExpression(channelName: string, expression: string, weight: number): void {
    const channel = this.channels.get(channelName);
    if (!channel) {
      console.warn(`[ExpressionMixer] Unknown channel: ${channelName}`);
      return;
    }
    channel.expressions.set(expression, Math.max(0, Math.min(1, weight)));
  }

  /**
   * Clear all expressions in a channel
   */
  clearChannel(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (channel) {
      channel.expressions.clear();
    }
  }

  /**
   * Enable/disable a channel
   */
  setChannelEnabled(channelName: string, enabled: boolean): void {
    const channel = this.channels.get(channelName);
    if (channel) {
      channel.enabled = enabled;
      this._channelsDirty = true;
    }
  }

  /**
   * Apply blended expressions to VRM expression manager
   * Call this each frame.
   */
  apply(): void {
    if (!this.expressionManager) return;

    // Clear previous values
    this.finalValues.clear();

    // Re-sort channels only when channel list changed (not every frame)
    if (this._channelsDirty) {
      this._sortedChannels = Array.from(this.channels.values())
        .filter(c => c.enabled)
        .sort((a, b) => b.priority - a.priority);
      this._channelsDirty = false;
    }

    // Reuse set (clear instead of allocating new)
    this._setByHigher.clear();

    // Process channels in priority order
    for (const channel of this._sortedChannels) {
      for (const [expr, weight] of channel.expressions) {
        // Skip if already set by higher priority
        if (this._setByHigher.has(expr)) continue;

        // Apply weight
        if (weight > 0.01) {
          this.finalValues.set(expr, weight);
          this._setByHigher.add(expr);
        }
      }
    }

    // Apply all final values to expression manager
    for (const [expr, weight] of this.finalValues) {
      try {
        this.expressionManager.setValue(expr, weight);
      } catch (_e) {
        // Expression may not exist on this model
      }
    }

    // Reset expressions not in final values (that were previously set)
    // This prevents stale expressions from lingering
    for (const expr of this.appliedExpressions) {
      if (!this.finalValues.has(expr)) {
        try {
          this.expressionManager.setValue(expr, 0);
        } catch (_e) {
          // Expression may not exist on this model
        }
      }
    }

    // Swap double-buffered sets instead of allocating new Set
    this._prevApplied.clear();
    const swap = this._prevApplied;
    this._prevApplied = this.appliedExpressions;
    this.appliedExpressions = swap;
    for (const k of this.finalValues.keys()) {
      this.appliedExpressions.add(k);
    }
  }

  /**
   * Get current blended value for an expression (for debugging)
   */
  getValue(expression: string): number {
    return this.finalValues.get(expression) ?? 0;
  }

  /**
   * Debug: List all active expressions
   */
  getActiveExpressions(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [expr, weight] of this.finalValues) {
      if (weight > 0.01) {
        result[expr] = weight;
      }
    }
    return result;
  }

  /**
   * Dispose and clear all channels
   */
  dispose(): void {
    this.channels.clear();
    this.finalValues.clear();
    this.appliedExpressions.clear();
    this.expressionManager = null;
  }
}

export default ExpressionMixer;
