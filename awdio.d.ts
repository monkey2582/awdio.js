/**
 * Awdio - 轻量级 Web Audio 音频库
 * 支持合成波形、公式自定义声音、3D 空间音频、网络/本地音频、队列播放、链式调用等
 * @version 3.6.0
 */

declare class Awdio {
  /** 已知波形类型列表 */
  static readonly _waveTypes: string[];

  /** 用户自定义公式注册表 */
  static readonly _formulas: Map<string, (t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number>;

  /** 获取/创建共享 AudioContext */
  static getContext(): AudioContext;

  /** 获取/创建全局增益节点 */
  static getGlobalGainNode(): GainNode;

  /** 设置全局音量（百分制，0-100） */
  static setGlobalVolume(vol: number): void;

  /** 获取全局音量 */
  static getGlobalVolume(): number;

  /**
   * 获取所有音频输出设备
   * @returns 设备列表 [{ deviceId, label, groupId }]
   */
  static getAllDevices(): Promise<Array<{ deviceId: string; label: string; groupId: string }>>;

  /**
   * 设置全局音频输出设备
   * @param deviceId - 单个设备 ID、设备 ID 数组、或不传恢复默认
   *
   * 示例：Awdio.setGlobalOutput('default')
   *       Awdio.setGlobalOutput(['id1', 'id2'])  // 多设备同步输出
   *       Awdio.setGlobalOutput()                // 恢复默认
   */
  static setGlobalOutput(deviceId?: string | string[] | null): Promise<void>;

  /** 通过名称获取实例 */
  static getInstance(name: string): Awdio | null;

  /** 通过名称获取实例的选项 */
  static getOption(name: string): AwdioOptions | null;

  /** 通过名称销毁实例 */
  static destroy(name: string): void;

  /**
   * 定义自定义声音公式
   * @param name - 公式名称（随后可在 type / formula 字段中使用该名称）
   * @param fn   - 公式函数 fn(t, freq, sr, opts)
   *   参数: t=当前时间(秒), freq=基频, sr=采样率, opts=当前实例选项
   *   返回: -1~1 的采样值
   *
   * 示例: Awdio.defineFormula('myWave', (t, freq, sr) => Math.sin(2*Math.PI*freq*t) * Math.exp(-t*2))
   *       new Awdio('myWave').play()
   */
  static defineFormula(name: string, fn: (t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number): void;

  /**
   * 设置 3D 空间音频监听者位置/朝向
   * @param opts
   *   opts.x, opts.y, opts.z          - 监听者 3D 坐标
   *   opts.forwardX, opts.forwardY, opts.forwardZ - 前方向量
   *   opts.upX, opts.upY, opts.upZ    - 上方向量
   *
   * 示例: Awdio.listener({ x: 0, y: 0, z: 0, forwardX: 0, forwardY: 0, forwardZ: -1 })
   */
  static listener(opts: {
    x?: number; y?: number; z?: number;
    forwardX?: number; forwardY?: number; forwardZ?: number;
    upX?: number; upY?: number; upZ?: number;
  }): void;

  /** 判断字符串是否为 URL */
  static _isURL(str: string): boolean;

  /** 判断字符串是否为 data URI */
  static _isDataURI(str: string): boolean;

  /** 判断字符串是否为已知波形类型（含自定义公式名） */
  static _isWaveType(str: string): boolean;

  /** 解析播放位置 */
  static _parseTime(time: number | string): number;

  /**
   * 将任意输入解析为 Awdio 实例
   * 支持：Awdio 实例 / 实例名称 / 函数（公式） / 选项对象 / src字符串
   */
  static _resolve(item: Awdio | string | AwdioOptions | ((t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number)): Awdio | null;

  /**
   * 队列播放（顺序播放，一个播完再播下一个）
   *
   * 支持数组写法：Awdio.queue([a, b, c], { loop, delay, fade, autoplay })
   * 支持快速写法：Awdio.queue(a, b, c)
   * 支持公式：Awdio.queue(myFormulaFn, "sine", { freq: 880 })
   */
  static queue(...args: any[]): AwdioManager;

  /**
   * 同时播放（所有音频同时播放）
   *
   * 支持数组写法：Awdio.playAll([a, b, c], { loop, fade, autoplay })
   * 支持快速写法：Awdio.playAll(a, b, c)
   * 支持公式：Awdio.playAll(myFormulaFn, "kick", inst)
   */
  static playAll(...args: any[]): AwdioManager;

  // ==================== 构造函数 ====================

  /**
   * 构造函数
   *
   * 优先级：src > formula > type（同时存在时按此优先级选取）
   *
   * 支持调用方式：
   *   new Awdio(path)              - 本地/网络音频路径
   *   new Awdio(path, opts)         - 路径 + 选项
   *   new Awdio(type)               - 合成波形类型
   *   new Awdio(type, opts)         - 波形类型 + 选项
   *   new Awdio(opts)               - 完整选项对象（含 { formula: fn } 或 { type: fn }）
   *   new Awdio(fn)                 - 直接传入公式函数
   */
  constructor(arg1?: string | AwdioOptions | ((t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number), arg2?: AwdioOptions);

  // ==================== 事件系统 ====================

  /** 注册事件 */
  on(event: string, fn: (data?: any) => void): this;
  /** 移除事件 */
  off(event: string, fn: (data?: any) => void): this;

  // ==================== 播放控制 ====================

  /**
   * 播放
   * @param arg - 字符串（类型/URL/路径）、函数（公式）、或选项对象，传入时先设置再播放
   *
   * 示例: .play()
   *       .play({ volume: 50 })
   *       .play("sine")
   *       .play(myFormulaFn)
   */
  play(arg?: string | Partial<AwdioOptions> | ((t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number)): this;

  /**
   * 暂停
   * @param arg - 字符串（类型/URL/路径）、函数（公式）、或选项对象
   */
  pause(arg?: string | Partial<AwdioOptions> | ((t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number)): this;

  /**
   * 停止
   * @param arg - 字符串（类型/URL/路径）、函数（公式）、或选项对象
   */
  stop(arg?: string | Partial<AwdioOptions> | ((t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number)): this;

  /**
   * 跳转到指定位置
   * 支持格式：seek(10) / seek("1:30") / seek("1:30:00")
   */
  seek(time: number | string): this;

  // ==================== 选项设置 ====================

  /**
   * 设置选项
   *
   * 优先级：src > formula > type（同时传入时按此优先级选取）
   *
   * 支持：.set({ volume: 50, loop: true })
   *      .set({ formula: myFn })  - 设置公式
   *      .set("sine")             - 字符串形式设置波形/公式名
   *      .set("https://...")      - 字符串形式设置 URL
   *      .set(fn)                 - 函数作为公式
   */
  set(arg: string | Partial<AwdioOptions> | ((t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number)): this;

  /** 设置音量（百分制，0-100） */
  setVolume(vol: number): this;
  /** 获取音量（百分制） */
  getVolume(): number;

  /** 静音切换 */
  mute(muted?: boolean): this;

  /** 设置实例名称 */
  setName(name: string): this;

  /** 获取当前所有选项 */
  getOption(): Readonly<AwdioOptions>;

  // ==================== 属性 ====================

  /** 实例名称 */
  readonly name: string;
  /** 音频源路径 */
  src: string | null;
  /** 当前公式函数（当使用 formula 或 type: fn 时） */
  readonly formula: ((t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number) | null;
  /** 音量（百分制） */
  volume: number;
  /** 当前播放时间（秒） */
  currentTime: number;
  /** 音频时长（秒），合成音频可写 */
  duration: number;
  /** 是否正在播放 */
  readonly playing: boolean;

  // ==================== 延迟 ====================

  /** 设置播放延迟（毫秒） */
  delay(ms: number): this;

  // ==================== 淡入淡出 ====================

  /** 淡出并停止 */
  fadeOut(duration?: number): this;

  // ==================== 3D 空间音频 ====================

  /**
   * 设置 3D 空间位置
   * @param opts - 配置对象 / x 坐标 / falsy 表示关闭
   *   opts.x, opts.y, opts.z - 3D 坐标
   *
   * 示例：.spatial({ x: 5, y: 0, z: -10 })
   *       .spatial(5, 0, -10)
   *       .spatial()          // 关闭 3D 定位
   */
  spatial(opts?: { x?: number; y?: number; z?: number } | number | false | null): this;

  // ==================== 音效处理 ====================

  /**
   * 混响效果
   * @param opts - 配置对象 / mix值(0-1) / falsy 表示关闭
   *   opts.room: 房间大小 0-1（默认 0.5）
   *   opts.damp: 高频阻尼 0-1（默认 0.5）
   *   opts.mix:  干湿比 0-1（默认 0.5）
   *
   * 示例：.reverb({ room: 0.7, damp: 0.3, mix: 0.4 })
   *       .reverb(0.5)  // 仅设置 mix
   *       .reverb()     // 关闭混响
   */
  reverb(opts?: ReverbOptions | number | false | null): this;

  /**
   * 压缩器效果
   * @param opts - 配置对象 / gain值(0-1) / falsy 表示关闭
   *   opts.thresh: 阈值 dB（默认 -24）
   *   opts.knee:   拐点 dB（默认 30）
   *   opts.ratio:  压缩比（默认 12）
   *   opts.gain:   补偿增益 0-1（默认 0.5）
   *
   * 示例：.comp({ thresh: -30, knee: 10, ratio: 8, gain: 0.6 })
   *       .comp(0.5)  // 仅设置增益
   *       .comp()     // 关闭压缩器
   */
  comp(opts?: CompOptions | number | false | null): this;

  /**
   * 滤波器效果
   * 支持三种调用方式：
   *   .filter(1000)              - 低通 1000Hz
   *   .filter(1000, 5)           - 低通 1000Hz, Q=5（共鸣）
   *   .filter({ freq: 1000, q: 5, type: 'highpass' }) - 完整配置
   *   .filter()                  - 关闭滤波器
   *
   * type 可选：'lowpass' | 'highpass' | 'bandpass' | 'lowshelf' | 'highshelf' | 'peaking' | 'notch' | 'allpass'
   */
  filter(freq?: number | FilterOptions | false | null, q?: number): this;

  /**
   * 合唱效果
   * @param opts - 配置对象 / falsy 表示关闭
   *   opts.perc: 调制深度 0-1（默认 0.3）
   *   opts.lag:  延迟时间 秒（默认 0.02）
   *
   * 示例：.chorus({ perc: 0.5, lag: 0.03 })
   *       .chorus()  // 关闭合唱
   */
  chorus(opts?: ChorusOptions | number | false | null): this;

  /**
   * 设置 ADSR 包络
   * @param opts - 配置对象 / falsy 表示关闭
   *   opts.attack:  起音时间 秒（默认 0.01）
   *   opts.decay:   衰减时间 秒（默认 0.1）
   *   opts.sustain: 保持电平 0-1（默认 0.7）
   *   opts.release: 释音时间 秒（默认 0.3）
   *
   * 示例：.envelope({ attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.5 })
   *       .envelope()  // 关闭包络
 */
  envelope(opts?: EnvelopeOptions | false | null): this;

  // ==================== 实例设备路由 ====================

  /**
   * 设置/获取实例输出设备
   * @param deviceId - 单个设备 ID、设备 ID 数组、null 恢复默认、不传获取当前
   *
   * 示例：.device('default')
   *       .device(['id1', 'id2'])  // 多设备同步输出
   *       .device()                // 获取当前设备配置
   *       .device(null)            // 恢复默认
   */
  device(): string | string[] | null;
  device(deviceId: string | string[] | null): this;

  // ==================== clone 方法 ====================

  /**
   * 克隆当前实例（不修改原实例），可选传入变更
   * 支持 .clone()  /  .clone({ volume: 50 })  /  .clone("sine")  /  .clone("https://...")  /  .clone(fn)
   */
  clone(arg?: string | Partial<AwdioOptions> | ((t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number)): Awdio;

  // ==================== destroy 方法 ====================

  /** 销毁实例 */
  destroy(): void;
}

/** Awdio 波形类型 */
type AwdioWaveType =
  // 基础波形
  | 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise'
  | 'cosine' | 'tan' | 'pulse'
  // 乐器模拟
  | 'organ' | 'bell' | 'guitar' | 'piano' | 'strings' | 'brass' | 'flute'
  | 'cello' | 'violin' | 'harp' | 'marimba' | 'vibraphone'
  // 管乐器
  | 'clarinet' | 'oboe' | 'bassoon' | 'trumpet' | 'trombone' | 'tuba'
  // 打击乐
  | 'kick' | 'snare' | 'hihat' | 'pluck'
  | 'tom' | 'clap' | 'crash' | 'ride' | 'cowbell' | 'rimshot'
  // FM 合成
  | 'epiano' | 'fm_bell' | 'fm_bass' | 'fm_lead'
  // 模拟合成器
  | 'synth_bass' | 'synth_lead' | 'synth_pad' | 'supersaw' | 'sub_bass'
  // 效果音
  | 'laser' | 'sweep' | 'bubble' | 'click';

/** 混响效果选项 */
interface ReverbOptions {
  /** 房间大小 0-1（默认 0.5） */
  room?: number;
  /** 高频阻尼 0-1（默认 0.5） */
  damp?: number;
  /** 干湿比 0-1（默认 0.5） */
  mix?: number;
}

/** 压缩器效果选项 */
interface CompOptions {
  /** 阈值 dB（默认 -24） */
  thresh?: number;
  /** 拐点 dB（默认 30） */
  knee?: number;
  /** 压缩比（默认 12） */
  ratio?: number;
  /** 补偿增益 0-1（默认 0.5） */
  gain?: number;
}

/** 合唱效果选项 */
interface ChorusOptions {
  /** 调制深度 0-1（默认 0.3） */
  perc?: number;
  /** 延迟时间 秒（默认 0.02） */
  lag?: number;
}

/** ADSR 包络选项 */
interface EnvelopeOptions {
  /** 起音时间 秒（默认 0.01） */
  attack?: number;
  /** 衰减时间 秒（默认 0.1） */
  decay?: number;
  /** 保持电平 0-1（默认 0.7） */
  sustain?: number;
  /** 释音时间 秒（默认 0.3） */
  release?: number;
}

/** 滤波器选项 */
interface FilterOptions {
  /** 截止频率 Hz（默认 1000） */
  freq?: number;
  /** 共鸣度 Q 值 0.0001-1000（默认 0） */
  q?: number;
  /** 滤波器类型 */
  type?: 'lowpass' | 'highpass' | 'bandpass' | 'lowshelf' | 'highshelf' | 'peaking' | 'notch' | 'allpass';
}

/** Awdio 实例选项 */
interface AwdioOptions {
  /** 音频文件 URL（支持 http/https URL、本地路径、data URI）。优先级最高 */
  src?: string;
  /**
   * 自定义公式函数（优先级仅次于 src，高于 type）
   * fn(t, freq, sr, opts) => -1~1
   */
  formula?: ((t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number);
  /** 合成波形类型（支持内置类型、自定义公式名、或直接传入公式函数） */
  type?: AwdioWaveType | ((t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number);
  /** 合成音频频率 (Hz) */
  freq?: number;
  /** 合成音频时长（秒，默认 2） */
  duration?: number;
  /** 音量（百分制，0-100） */
  volume?: number;
  /** 是否循环 */
  loop?: boolean;
  /** 多音模式 */
  poly?: boolean;
  /** 是否自动播放 */
  autoplay?: boolean;
  /** 是否静音 */
  muted?: boolean;
  /** 实例名称 */
  name?: string;
  /** 输出设备 ID 或设备 ID 数组 */
  device?: string | string[];
  /** 是否启用淡入淡出（统一设置 fadeIn 和 fadeOut） */
  fade?: boolean;
  /** 是否启用淡入 */
  fadeIn?: boolean;
  /** 是否启用淡出 */
  fadeOut?: boolean;
  /** 淡入淡出统一时长（秒） */
  fadeDuration?: number;
  /** 淡入时长（秒） */
  fadeInDuration?: number;
  /** 淡出时长（秒） */
  fadeOutDuration?: number;
  /** 延迟播放（毫秒，内部使用） */
  delayMs?: number;
  /** 是否已销毁（内部使用） */
  destroyed?: boolean;
}

/** 队列/并行播放管理器 - 由 Awdio.queue() 和 Awdio.playAll() 返回 */
interface AwdioManager {
  /** 注册事件 */
  on(event: string, fn: (data?: any) => void): this;

  /**
   * 开始播放
   * .play() - 播放全部
   * .play(1, 2) - 仅播放指定索引
   */
  play(...indices: number[]): this;

  /**
   * 暂停
   * .pause() - 暂停全部
   * .pause(1, 2) - 暂停指定索引
   */
  pause(...indices: number[]): this;

  /** 停止全部 */
  stop(): this;

  /**
   * 移除指定位置的音频（不能移除正在播放的）
   * @param index - 要移除的索引
   */
  remove(index: number): this;

  /**
   * 添加音频到指定位置
   * @param item - Awdio实例/名称/src/opts/公式函数
   * @param position - 位置，默认最后
   */
  add(item: Awdio | string | AwdioOptions | ((t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number), position?: number): this;

  /**
   * 对调两个位置的音频
   * @param a - 第一个位置
   * @param b - 第二个位置
   */
  toggle(a: number, b: number): this;

  /** 获取所有项目 */
  readonly items: ReadonlyArray<Awdio>;

  /** 是否正在播放 */
  readonly playing: boolean;

  /**
   * 获取当前正在播放的音频实例
   * - sequential 模式：返回单个 Awdio 实例或 null
   * - parallel 模式：返回正在播放的 Awdio 实例数组
   */
  readonly playingAudio: Awdio | Awdio[] | null;
}

export = Awdio;
export as namespace Awdio;