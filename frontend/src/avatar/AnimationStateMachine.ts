/**
 * Animation State Machine
 * Loads animation config from JSON and manages state transitions.
 * Config files define which animation files to use for each action.
 */

import { animationLibrary } from './AnimationLibrary';

// Config file structure
export interface AnimationStateConfig {
  file: string;
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
}

export interface AnimationStateMachineConfig {
  version: number;
  name: string;
  description?: string;
  
  idle: AnimationStateConfig;
  
  actions: Record<string, AnimationStateConfig>;
  
  defaults?: {
    fadeIn?: number;
    fadeOut?: number;
    loop?: boolean;
    returnToIdle?: boolean;
  };
}

// Resolved action with defaults applied
export interface ResolvedAction {
  file: string;
  loop: boolean;
  fadeIn: number;
  fadeOut: number;
}

const DEFAULT_CONFIG_PATH = '/animations/state-machine.json';

const DEFAULT_VALUES = {
  fadeIn: 0.25,
  fadeOut: 0.25,
  loop: false,
};

export class AnimationStateMachine {
  private config: AnimationStateMachineConfig | null = null;
  private configPath: string = DEFAULT_CONFIG_PATH;
  private loaded: boolean = false;

  /**
   * Load state machine config from JSON file
   */
  async load(configPath?: string): Promise<boolean> {
    if (configPath) {
      this.configPath = configPath;
    }

    try {
      const response = await fetch(this.configPath);
      if (!response.ok) {
        console.warn(`[AnimationStateMachine] Could not load config: ${this.configPath}`);
        return false;
      }

      this.config = await response.json();
      this.loaded = true;
      
      console.log(`[AnimationStateMachine] Loaded: ${this.config?.name} (${Object.keys(this.config?.actions || {}).length} actions)`);
      return true;
    } catch (err) {
      console.warn(`[AnimationStateMachine] Error loading config:`, err);
      return false;
    }
  }

  /**
   * Check if config is loaded
   */
  isLoaded(): boolean {
    return this.loaded && this.config !== null;
  }

  /**
   * Get the idle animation config
   */
  getIdle(): ResolvedAction | null {
    if (!this.config) return null;
    
    const idle = this.config.idle;
    const defaults = this.config.defaults || {};
    
    return {
      file: idle.file,
      loop: idle.loop ?? true,
      fadeIn: idle.fadeIn ?? defaults.fadeIn ?? DEFAULT_VALUES.fadeIn,
      fadeOut: idle.fadeOut ?? defaults.fadeOut ?? DEFAULT_VALUES.fadeOut,
    };
  }

  /**
   * Get config for a named action (wave, bow, etc.)
   */
  getAction(name: string): ResolvedAction | null {
    if (!this.config) return null;
    
    const action = this.config.actions[name];
    if (!action) {
      console.warn(`[AnimationStateMachine] Unknown action: ${name}`);
      return null;
    }
    
    const defaults = this.config.defaults || {};
    
    return {
      file: action.file,
      loop: action.loop ?? defaults.loop ?? DEFAULT_VALUES.loop,
      fadeIn: action.fadeIn ?? defaults.fadeIn ?? DEFAULT_VALUES.fadeIn,
      fadeOut: action.fadeOut ?? defaults.fadeOut ?? DEFAULT_VALUES.fadeOut,
    };
  }

  /**
   * Get list of available action names
   */
  getAvailableActions(): string[] {
    if (!this.config) return [];
    return Object.keys(this.config.actions);
  }

  /**
   * Get the raw config (for debugging)
   */
  getConfig(): AnimationStateMachineConfig | null {
    return this.config;
  }

  /**
   * Check if an action exists
   */
  hasAction(name: string): boolean {
    return this.config?.actions?.[name] !== undefined;
  }

  /**
   * Preload all animation files referenced in config
   */
  async preloadAll(): Promise<void> {
    if (!this.config) return;

    const files = new Set<string>();
    
    // Add idle
    files.add(this.config.idle.file);
    
    // Add all actions
    for (const action of Object.values(this.config.actions)) {
      files.add(action.file);
    }

    // Load all through animation library
    const loadPromises = Array.from(files).map(file => 
      animationLibrary.load(file).catch(err => {
        console.warn(`[AnimationStateMachine] Failed to preload ${file}:`, err);
      })
    );

    await Promise.all(loadPromises);
    console.log(`[AnimationStateMachine] Preloaded ${files.size} animation files`);
  }
}

// Singleton instance
export const animationStateMachine = new AnimationStateMachine();

export default AnimationStateMachine;
