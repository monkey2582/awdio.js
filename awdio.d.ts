/**
 * Awdio - 轻量级 Web Audio 音频库
 * 支持合成波形、公式自定义声音、3D 空间音频、网络/本地音频、队列播放、链式调用等
 * @version 3.10.0
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
   * 全局静音
   * @param val - true 静音 / false 取消 / 不传切换
   */
  static mute(val?: boolean): void;

  /**
   * 停止所有实例及队列（淡出后停止）
   */
  static stopAll(): void;

  /**
   * 暂停/恢复所有实例及队列
   * @param val - true 暂停（默认）/ false 恢复
   */
  static pauseAll(val?: boolean): void;

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
   * MIDI 音符转频率
   * @param note - MIDI 音符编号（69=A4=440Hz）
   * @returns 频率 (Hz)
   * 示例：Awdio.midicps(69) → 440，Awdio.midicps(60) → 261.63 (C4)
   */
  static midicps(note: number): number;

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
   * 支持数组写法：Awdio.queue([a, 200, b, c], { loop, delay, fade, autoplay })
   *   数字跟在 item 后表示逐项延迟（叠加全局 delay）
   * 支持扁平写法：Awdio.queue(100, a, 200, b, 300)  // 数字=延迟
   * 支持公式：Awdio.queue(myFormulaFn, "sine", { freq: 880 })
   */
  static queue(...args: any[]): AwdioManager;

  /**
   * 同时播放（所有音频同时播放）
   *
   * 支持数组写法：Awdio.playAll([a, 200, b, c], { loop, fade, autoplay })
   * 支持扁平写法：Awdio.playAll(100, a, 200, b)
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

  /**
   * 注册事件
   * 支持事件：'play' | 'pause' | 'stop' | 'end' | 'load' | 'progress' | 'error' | 'destroy' | 'deviceLost'
   *
   * 'deviceLost' - 输出设备断开时触发，自动降回扬声器
   *   data: { prevDevice: string[] } - 断开的设备 ID 列表
   */
  on(event: string, fn: (data?: any) => void): this;
  /** 移除事件 */
  off(event: string, fn: (data?: any) => void): this;

  // ==================== 播放控制 ====================

  /**
   * 播放
   * @param arg - 字符串（clip 名称/类型/URL/路径）、函数（公式）、或选项对象
   *
   * clip 模式：若配置了 clip 或通过 defineClip 定义了片段，且 arg 匹配片段名称，则播放对应片段
   * 示例: .play()
   *       .play({ volume: 50 })
   *       .play("sine")
   *       .play("laser")        // clip 名称（需配置 clip 或 defineClip）
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

  // ==================== 增益运算 ====================

  /** 设置/获取增益值（线性 0-1） */
  gain(): number;
  gain(val: number): this;

  /** 增益乘以系数 */
  mul(val: number): this;
  /** 增益除以系数 */
  div(val: number): this;
  /** 增益加上偏移量 */
  add(val: number): this;
  /** 增益减去偏移量 */
  sub(val: number): this;

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

  // ==================== 倍速 / 音高 / 倒放 ====================

  /**
   * 设置/获取播放倍速
   * @param rate - 倍速 0.1~10，不传获取当前值
   */
  speed(): number;
  speed(rate: number): this;

  /**
   * 设置/获取音高（通过 playbackRate 实现）
   * @param rate - 音高比率 0.1~10，1=原声，2=高八度，0.5=低八度
   */
  pitch(): number;
  pitch(rate: number): this;

  /**
   * 设置/获取倒放
   * @param rev - 是否倒放，不传获取当前值
   */
  reverse(): boolean;
  reverse(rev: boolean): this;

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
   * 高通滤波器便捷方法
   * @param freq - 截止频率 Hz / falsy 关闭
   * @param q   - 共鸣度 Q 值
   */
  hpf(freq?: number | FilterOptions | false | null, q?: number): this;

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
   * 波形塑形/失真效果
   * @param opts - 配置对象 / amount值(0-1) / falsy 表示关闭
   *   opts.amount: 失真量 0-1（默认 0.5）
   *   opts.curve:  'soft' | 'hard' | 'fuzz' | 'crunch' | 'fold'（默认 'soft'）
   *
   * 示例：.waveshaper({ amount: 0.7, curve: 'hard' })
   *       .waveshaper(0.5)  // 仅设置 amount，默认 soft
   *       .waveshaper()     // 关闭失真
   */
  waveshaper(opts?: WaveshaperOptions | number | false | null): this;

  /**
   * 移相效果（Phaser）
   * @param opts - 配置对象 / rate值(Hz) / falsy 表示关闭
   *   opts.rate:   调制速率 Hz（默认 1）
   *   opts.depth:  调制深度 0-1（默认 0.5）
   *   opts.freq:   中心频率 Hz（默认 1000）
   *   opts.fb:     反馈量 0-1（默认 0.4）
   *   opts.stages: 移相阶数 2-12（默认 4）
   *
   * 示例：.phaser({ rate: 0.5, depth: 0.7, freq: 800, fb: 0.5 })
   *       .phaser(1)     // 仅设置 rate
   *       .phaser()      // 关闭移相
   */
  phaser(opts?: PhaserOptions | number | false | null): this;

  /**
   * 拨弦：使用 Karplus-Strong 算法生成拨弦音并播放
   * @param freq - 频率 Hz（默认 440）/ 配置对象
   * @param opts - 播放选项
   *   opts.duration: 衰减时长 秒（默认 1.5）
   *   opts.decay:    衰减系数 0.9-0.999（默认 0.996）
   *
   * 示例：.pluck(440)  .pluck(220, { duration: 2 })  .pluck({ freq: 330, decay: 0.99 })
   */
  pluck(freq?: number | PluckOptions, opts?: PluckOptions): this;

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

  // ==================== FFT 频谱分析 ====================

  /**
   * 启用/配置/关闭频谱分析器（AnalyserNode）
   * @param opts - 配置对象 / fftSize数值 / falsy关闭
   *
   * 示例：.analyser()                          // 默认配置启用
   *       .analyser({ fftSize: 512, smoothing: 0.5 })
   *       .analyser(1024)                      // 仅设置 fftSize
   *       .analyser(false)                     // 关闭
   */
  analyser(opts?: AnalyserOptions | number | false | null): this;

  /**
   * 获取频域数据（频谱）
   * @param opts - { normalized: true } 返回 0~1 的 Float32Array，否则返回 0~255 的 Uint8Array
   * @returns 频域数据，长度 = fftSize/2；未启用时返回 null
   */
  freqData(opts?: { normalized?: boolean }): Uint8Array | Float32Array | null;

  /**
   * 获取时域波形数据
   * @param opts - { normalized: true } 返回 -1~1 的 Float32Array，否则返回 0~255 的 Uint8Array
   * @returns 时域数据，长度 = fftSize；未启用时返回 null
   */
  timeData(opts?: { normalized?: boolean }): Uint8Array | Float32Array | null;

  // ==================== 参数 a / r / param ====================

  /**
   * 设置/获取 attack 起音时间（秒）
   * @param val - 起音时间，不传获取当前值
   */
  a(): number;
  a(val: number): this;

  /**
   * 设置/获取 release 释音时间（秒）
   * @param val - 释音时间，不传获取当前值
   */
  r(): number;
  r(val: number): this;

  /**
   * 设置/获取/删除参数（连接真实音频链路）
   *
   * 保留参数名（直接路由到 AudioParam）：
   *   'gain'       → 输出增益 0-1
   *   'vol'        → 输出增益（百分制 0-100）
   *   'chainGain'  → 链输入增益 0-1
   *   'filterFreq' → 滤波器截止频率 Hz
   *   'filterQ'    → 滤波器 Q 值
   *   'pan'        → 立体声平衡 -1~1（自动创建 StereoPanner）
   *   'freq'       → 合成频率 Hz
   *   'speed'      → 播放倍速 0.1-10
   *
   * 自定义参数名 → 存入 _params 字典
   */
  param(key: string): any;
  param(key: string, val: any): this;

  // ==================== 参数自动化调度 ====================

  /**
   * 线性渐变到目标值
   * @param paramName - 参数名 ('gain'|'vol'|'chainGain'|'filterFreq'|'filterQ'|'pan')
   * @param target - 目标值
   * @param duration - 渐变时长（秒）
   * @param delay - 延迟开始时间（秒，默认 0）
   *
   * 快捷写法：.ramp(target, duration) → 默认 ramp gain
   *
   * 示例：.ramp('gain', 0, 2)           // 2s 内增益降到 0
   *       .ramp('filterFreq', 8000, 1.5) // 1.5s 内扫频到 8kHz
   *       .ramp(0.5, 1)                  // 1s 内 gain 渐变到 0.5
   */
  ramp(paramName: string | number, target: number, duration: number, delay?: number): this;

  /**
   * 指数渐变到目标值
   * @param paramName - 参数名
   * @param target - 目标值
   * @param duration - 渐变时长（秒）
   * @param delay - 延迟开始时间（秒，默认 0）
   *
   * 快捷写法：.expoRamp(target, duration) → 默认 ramp gain
   */
  expoRamp(paramName: string | number, target: number, duration: number, delay?: number): this;

  /**
   * 在指定时间点设置参数值（不渐变）
   * @param paramName - 参数名
   * @param value - 目标值
   * @param time - 目标时间（秒，相对于 now；默认 0 = 立即）
   *
   * 快捷写法：.setAtTime(value, time) → 默认 set gain
   */
  setAtTime(paramName: string | number, value: number, time?: number): this;

  /**
   * 取消所有已调度但未执行的参数变化
   * @param paramName - 参数名，不传则取消所有
   */
  cancelSched(paramName?: string): this;

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

  // ==================== 音频片段 (clip) ====================

  /**
   * 定义命名片段
   * @param name - 片段名称，之后可通过 .play(name) 播放
   * @param from - 起始时间 毫秒
   * @param to - 结束时间 毫秒
   * @returns this
   *
   * 示例：sfx.defineClip('laser', 0, 500).defineClip('boom', 1000, 2000)
   *       sfx.play('laser')
   */
  defineClip(name: string, from: number, to: number): this;

  /**
   * 创建音频片段的新实例（共享源 buffer，不重复加载）
   * @param start - 起始时间 毫秒
   * @param end - 结束时间 毫秒（不传则到末尾）
   * @returns 新的 Awdio 实例，仅播放该片段
   *
   * 示例：sfx.clip(0, 1000).play()   // 播放 0~1000ms
   *       sfx.clip(2000).play()      // 播放 2000ms 到末尾
   */
  clip(start: number, end?: number): Awdio;

  // ==================== destroy 方法 ====================

  /** 销毁实例 */
  destroy(): void;
}

/** Awdio 波形类型 */
type AwdioWaveType =
  // 基础波形
  | 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise' | 'pink'
  | 'cosine' | 'tan' | 'pulse'
  // 乐器模拟
  | 'organ' | 'bell' | 'guitar' | 'piano' | 'strings' | 'brass' | 'flute'
  | 'cello' | 'violin' | 'harp' | 'marimba' | 'vibraphone'
  // 管乐器
  | 'clarinet' | 'oboe' | 'bassoon' | 'trumpet' | 'trombone' | 'tuba'
  // 打击乐
  | 'kick' | 'snare' | 'hihat' | 'pluck' | 'perc'
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

/** 波形塑形/失真选项 */
interface WaveshaperOptions {
  /** 失真量 0-1（默认 0.5） */
  amount?: number;
  /** 曲线类型（默认 'soft'） */
  curve?: 'soft' | 'hard' | 'fuzz' | 'crunch' | 'fold';
}

/** 移相效果选项 */
interface PhaserOptions {
  /** 调制速率 Hz（默认 1） */
  rate?: number;
  /** 调制深度 0-1（默认 0.5） */
  depth?: number;
  /** 中心频率 Hz（默认 1000） */
  freq?: number;
  /** 反馈量 0-1（默认 0.4） */
  fb?: number;
  /** 移相阶数 2-12（默认 4） */
  stages?: number;
}

/** FFT 频谱分析器选项 */
interface AnalyserOptions {
  /** FFT 窗口大小，32~32768 的 2 的幂（默认 2048） */
  fftSize?: number;
  /** 时间平滑系数 0~1（默认 0.8） */
  smoothing?: number;
  /** 最小分贝值（默认 -100） */
  minDecibels?: number;
  /** 最大分贝值（默认 -30） */
  maxDecibels?: number;
}

/** 拨弦选项 */
interface PluckOptions {
  /** 频率 Hz（默认 440） */
  freq?: number;
  /** 衰减时长 秒（默认 1.5） */
  duration?: number;
  /** 衰减系数 0.9-0.999（默认 0.996） */
  decay?: number;
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
  /** 播放完毕后自动销毁实例（默认 false） */
  autoDestroy?: boolean;
  /**
   * 音频片段映射，支持按名称播放片段
   * 格式：{ name: [startMs, endMs] }
   *
   * 示例：clip: { laser: [0, 1000], explosion: [2000, 3000] }
   *       sfx.play('laser')  // 播放 0~1000ms
   */
  clip?: Record<string, [number, number]>;
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
  /** 播放倍速 0.1~10（默认 1） */
  speed?: number;
  /** 音高比率 0.1~10（默认 1），1=原声，2=高八度 */
  pitch?: number;
  /** 是否倒放（默认 false） */
  reverse?: boolean;
  /** Attack 起音时间 秒（默认 0.01） */
  a?: number;
  /** Release 释音时间 秒（默认 0.3） */
  r?: number;
  /** 任意命名参数存储 */
  params?: Record<string, any>;
  /** 延迟播放（毫秒，内部使用） */
  delayMs?: number;
  /** 是否正在播放（内部使用） */
  _isPlaying?: boolean;
  /** 当前倍速（内部使用） */
  _speed?: number;
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

  /**
   * 设置/获取队列逐项延迟（毫秒）
   * @param ms - 延迟毫秒数，不传获取当前值
   */
  delay(): number;
  delay(ms: number): this;

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