/**
 * Awdio - 轻量级 Web Audio 音频库
 * 支持合成波形、公式自定义声音、3D 空间音频、网络/本地音频、队列播放、链式调用等
 * @version 4.2.0
 */

declare class Awdio {
  /** 已知波形类型列表 */
  static readonly _waveTypes: string[];

  /** 用户自定义公式注册表 */
  static readonly _formulas: Map<string, (t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number>;

  /** 全局音频缓存：URL → 已解码 AudioBuffer */
  static readonly _audioCache: Map<string, AudioBuffer>;

  /** 获取/创建共享 AudioContext */
  static getContext(): AudioContext;

  /**
   * 手动解锁 AudioContext（自动播放策略）
   * 通常在用户手势回调中调用；getContext 已自动注册全局解锁，一般无需手动调用
   */
  static unlock(): Awdio;

  /** 清空全局音频缓存 */
  static clearCache(): Awdio;

  /** 获取/创建全局增益节点 */
  static getGlobalGainNode(): GainNode;

  /** 设置全局音量（0~1） */
  static setGlobalVolume(vol: number): void;

  /** 获取全局音量（0~1） */
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

  // ==================== MediaSession 集成 ====================

  /**
   * 全局 MediaSession 自动接管开关（默认 true）
   *
   * 开启时：实例/队列播放会自动向 navigator.mediaSession 推送 metadata 与
   * playbackState，并接管 play / pause / stop / seek 媒体键；
   * 队列与 playAll 还会额外接管 previoustrack / nexttrack。
   *
   * 设为 false 可完全关闭自动接管（自行接管 mediaSession 时使用）。
   *
   * 示例：Awdio.mediaSessionEnabled = false
   */
  static mediaSessionEnabled: boolean;

  /**
   * 设置默认媒体元数据（所有未单独调用 mediaSession() 的实例共用）
   * @param opts - { title, artist, album, artwork }；传 null 清除
   *
   * 示例：Awdio.setMediaSession({ artist: '我的应用' })
   */
  static setMediaSession(opts?: MediaSessionOptions | null): typeof Awdio;

  /** 读取默认媒体元数据 */
  static getMediaSession(): MediaSessionOptions | null;

  /** 当前接管 mediaSession 的实例或队列管理器（无则为 null） */
  static readonly mediaSessionOwner: Awdio | AwdioManager | null;

  /**
   * 手动指定 mediaSession 接管者（不受 mediaSessionEnabled=false 影响）
   * @param target - 实例 / 队列管理器；传 null 取消
   */
  static setMediaSessionOwner(target?: Awdio | AwdioManager | null): typeof Awdio;

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

  /**
   * 规范化 loop 入参为内部播放次数（内部使用）
   * 存法：完整播放的次数，1 = 只播一遍，Infinity = 无限循环
   * 任意负数 ( -1 / -2 / -Infinity / '-3' … ) / 0 / 'inf' / 'infinite' / 'infinity' / 'forever' / 'true' → Infinity
   * false / null / undefined / NaN / 非法值 → 1；n > 1 → Math.floor(n)
   */
  static _as(val: number | string | boolean | null | undefined): number;

  /**
   * 内部播放次数 → 对外 loop 语义（内部使用）
   * Infinity → true；0 / 1 / 非法 → false；其余数字原样返回
   */
  static _lv(n: number): boolean | number;

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

  /**
   * 创建实例并加载本地音频文件
   * @param file - File/Blob 对象、ArrayBuffer/TypedArray、或音频 URL/路径字符串
   * @param opts - 实例选项（如 { autoplay: true, volume: 0.8 }）
   *
   * 示例：let a = Awdio.load(fileInput.files[0], { autoplay: true })
   */
  static load(file: File | Blob | ArrayBuffer | ArrayBufferView | string, opts?: AwdioOptions): Awdio;

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
   * 支持事件：'play' | 'pause' | 'stop' | 'end' | 'loop' | 'load' | 'progress' | 'error' | 'destroy' | 'deviceLost'
   *
   * 'loop'       - 每完成一遍（非最后一遍）触发
   *   data: { count: number, total: number } - 已完成遍数 / 总遍数（无限循环时 total 为 Infinity）
   * 'deviceLost' - 输出设备断开时触发，自动降回扬声器
   *   data: { prevDevice: string[] } - 断开的设备 ID 列表
   */
  on(event: string, fn: (data?: any) => void): this;
  /** 移除事件 */
  off(event: string, fn: (data?: any) => void): this;

  // ==================== 完成回调 ====================

  /**
   * 注册播放完成回调（播放到末尾/循环结束时触发）
   * @param fn - 回调函数，this 指向当前实例
   * @param waitTime - 延迟多少毫秒后触发（从 end 时刻起算，默认 0）
   *
   * ⚠️ 注意：本方法**不是** Promise 的 then —— 不返回新 Promise、不接收
   * onRejected，且返回 this 使其具备 thenable 外形，在 Promise 链中可能被
   * 误判为 thenable 而永久挂起。需要 Promise 语义请使用 toPromise()。
   *
   * 示例：new Awdio('sine').then(() => console.log('播完了'))
   *       new Awdio('sine').then(() => next(), 500)  // 播完后延迟 500ms 执行
   */
  then(fn: (self: Awdio) => void, waitTime?: number): this;

  /**
   * then 的语义化别名：明确表达「播放完成后执行」，避免与 Promise 混淆
   * @param fn - 回调函数，this 指向当前实例
   * @param waitTime - 延迟多少毫秒后触发（默认 0）
   * @returns this
   *
   * 示例：new Awdio('sine').after(() => console.log('播完了'))
   */
  after(fn: (self: Awdio) => void, waitTime?: number): this;

  /**
   * after 的别名（更贴近 'end' 事件语义）
   * @param fn - 回调函数，this 指向当前实例
   * @param waitTime - 延迟多少毫秒后触发（默认 0）
   * @returns this
   */
  onEnd(fn: (self: Awdio) => void, waitTime?: number): this;

  /**
   * 返回一个真正的 Promise，在播放完成（end）时 resolve
   *
   * 与 then() 的区别：返回标准 Promise，可 await、可链式 .then/.catch。
   *
   * ⚠️ 由于实例自身是 thenable（带 then 方法），Promise 解析过程不得接触
   * 实例本身，否则会触发 thenable 采纳导致永久挂起。因此本方法
   * **resolve 为 true（原始值）**，实例请通过 onDone 回调获取。
   *
   * @param timeout - 可选超时（毫秒），超时后同样 resolve（不 reject）
   * @param onDone - 可选：结束时回调，参数为实例本身
   * @returns Promise<true>
   *
   * 示例：await new Awdio('beep.mp3').play().toPromise()
   *       await Awdio.queue(a, b).play().toPromise(5000)
   *       new Awdio('a.mp3').toPromise(0, self => self.stop())
   */
  toPromise(timeout?: number, onDone?: (self: Awdio) => void): Promise<true>;

  // ==================== 循环 / 重复 ====================

  /**
   * 设置/获取循环播放。单一 API，按入参类型自动判断语义：
   *   布尔 → 是否无限循环
   *   数字 → 重复播放的次数（总遍数）
   * @param val - true 无限循环 / false 只播一遍；数字 n 表示总共播放 n 遍
   *              （任意负数、0、'inf'、'forever' 等均视为无限循环）
   * @returns 不传时读取：无限循环返回 true，否则返回总遍数；
   *          false 语义（只播一遍）读取为 false；传值时返回 this 便于链式调用
   *
   * 示例：.loop()        // → true（无限）/ 3（播 3 遍）/ false（只播一遍）
   *       .loop(true)   // 开启无限循环
   *       .loop(false)  // 关闭循环，只播一遍
   *       .loop(3)      // 完整播放 3 遍后结束
   *
   * 注：如需得知「当前播到第几遍」，监听 'loop' / 'end' 事件的 data.count
   */
  loop(): boolean | number;
  loop(val: boolean | number | string | null): this;

  // ==================== 播放控制 ====================

  /**
   * 播放
   * @param arg - 字符串（clip 名称/类型/URL/路径）、函数（公式）、或选项对象
   *
   * clip 模式：若配置了 clip 或通过 defineClip 定义了片段，且 arg 匹配片段名称，则播放对应片段
   * 示例: .play()
   *       .play({ volume: 0.5 })
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

  /**
   * 加载本地音频文件（File / Blob / ArrayBuffer / URL 字符串）
   * @param file - File/Blob 对象、二进制数据、或音频 URL/路径
   * @param opts - 可选：{ autoplay: true } 加载完成后自动播放
   *
   * 示例：awdio.load(fileInput.files[0])
   *       awdio.load(file, { autoplay: true })
   */
  load(file: File | Blob | ArrayBuffer | ArrayBufferView | string, opts?: { autoplay?: boolean }): this;

  // ==================== 选项设置 ====================

  /**
   * 设置选项
   *
   * 优先级：src > formula > type（同时传入时按此优先级选取）
   *
   * 支持：.set({ volume: 0.5, loop: true })
   *      .set({ formula: myFn })  - 设置公式
   *      .set("sine")             - 字符串形式设置波形/公式名
   *      .set("https://...")      - 字符串形式设置 URL
   *      .set(fn)                 - 函数作为公式
   */
  set(arg: string | Partial<AwdioOptions> | ((t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number)): this;

  /** 设置音量（0~1） */
  setVolume(vol: number): this;
  /** 获取音量（0~1） */
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

  // ==================== MediaSession 元数据 ====================

  /**
   * 设置/获取本实例的媒体元数据（锁屏、通知栏、耳机遥控显示的信息）
   *
   * - 不传参：返回当前元数据；未设置返回 null
   * - 传 null / false：清除本实例元数据
   * - 传字符串：等价于 { title: 字符串 }
   * - 传对象：写入并立即同步（若本实例正在播放）
   *
   * 未设置的字段回退顺序：本实例 → Awdio.setMediaSession() 全局默认 → 自动推导
   * （src 文件名 / 波形类型 / 实例名）
   *
   * artwork 建议使用绝对 URL 或 data URI；blob: URL 在多数系统界面无法渲染，会被过滤。
   *
   * 示例：music.mediaSession({ title: '夜曲', artist: 'Chopin' })
   *       music.mediaSession({ artwork: 'https://cdn.example.com/cover.jpg' })
   *       music.mediaSession()      // 读取
   *       music.mediaSession(null)  // 清除
   */
  mediaSession(): MediaSessionOptions | null;
  mediaSession(opts: MediaSessionOptions | string | null | false): this;

  // ==================== 属性 ====================

  /** 实例名称 */
  readonly name: string;
  /** 音频源路径 */
  src: string | null;
  /** 当前公式函数（当使用 formula 或 type: fn 时） */
  readonly formula: ((t: number, freq: number, sr: number, opts: Readonly<AwdioOptions>) => number) | null;
  /** 音量（0~1） */
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
   * 设置/获取微调音高（音分 cents，±100 = 一个半音）
   * 仅 Web Audio 模式生效（HTML5 模式不支持 detune）
   * @param cents - 音分值（如 +50 升半音，-50 降半音），不传获取当前值
   */
  detune(): number;
  detune(cents: number): this;

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

  /**
   * 立体声平衡（StereoPanner）
   * @param val - -1（最左）~ 1（最右），0 = 居中；不传获取当前值
   *
   * 示例：.pan(-0.5)  .pan(1)  .pan()  .pan(0)
   */
  pan(): number;
  pan(val: number): this;

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
   * 延迟效果（Echo / Delay）
   * @param opts - 配置对象 / time值(秒) / falsy 表示关闭
   *   opts.time:       延迟时间 秒（默认 0.3）
   *   opts.feedback:   反馈量 0-0.95（默认 0.4），越大回声越多
   *   opts.mix:        干湿比 0-1（默认 0.4）
   *   opts.filterFreq: 反馈低通截止频率 Hz（可选，默认不滤波）
   *
   * 示例：.delay({ time: 0.35, feedback: 0.5, mix: 0.4 })
   *       .delay(0.5)      // 仅设置延迟时间
   *       .delay()         // 关闭延迟
   */
  delay(opts?: DelayOptions | number | false | null): this;

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
   *   'loop'       → 循环：布尔=是否无限循环；数字=总播放遍数（'repeat' 已移除）
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
   * 与 Awdio.setGlobalOutput() 按调用时间比较，后调用者生效。
   *
   * 示例：.setOutput('default')
   *       .setOutput(['id1', 'id2'])  // 多设备同步输出
   *       .setOutput()                // 获取当前输出配置
   *       .setOutput(null)            // 恢复默认
   */
  setOutput(): string | string[] | null;
  setOutput(deviceId: string | string[] | null): this;

  // ==================== clone 方法 ====================

  /**
   * 克隆当前实例（不修改原实例），可选传入变更
   * 支持 .clone()  /  .clone({ volume: 0.5 })  /  .clone("sine")  /  .clone("https://...")  /  .clone(fn)
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

/** MediaSession 媒体元数据（锁屏 / 通知栏 / 耳机遥控显示的信息） */
interface MediaSessionOptions {
  /** 标题，缺省时自动推导（src 文件名 / 波形类型 / 实例名） */
  title?: string;
  /** 艺术家 */
  artist?: string;
  /** 专辑 */
  album?: string;
  /**
   * 封面图。支持字符串或数组（可给出多尺寸，浏览器择优显示）
   *
   * ⚠️ 需绝对 URL 或 data URI。blob: URL（如 new Awdio(file) 的内部 objectURL）
   * 在多数系统界面无法渲染，会被过滤并打印警告。
   */
  artwork?: string | ArtworkItem | Array<string | ArtworkItem>;
  /** 内部使用：置 true 表示不推送本实例元数据 */
  silence?: boolean;
}

/** MediaSession 封面图条目 */
interface ArtworkItem {
  /** 图片 URL（绝对 URL 或 data URI） */
  src: string;
  /** MIME 类型，如 'image/png' */
  type?: string;
  /** 建议尺寸，如 '512x512' */
  sizes?: string;
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
  /** 房间大小 0-1（默认 0.5），使用自生成 IR 时生效 */
  room?: number;
  /** 高频阻尼 0-1（默认 0.5），使用自生成 IR 时生效 */
  damp?: number;
  /** 干湿比 0-1（默认 0.5） */
  mix?: number;
  /**
   * 湿信号比例 0-1（wad 兼容写法，与 mix 等价）
   * 示例：reverb: { wet: 0.5 }
   */
  wet?: number;
  /**
   * 外部脉冲响应文件（URL / ArrayBuffer / Blob / File）
   * 提供后优先使用，异步加载完成自动生效并触发 'load'（type='reverb-impulse'）
   * 不提供则使用内置自生成噪声 IR（离线可用）
   * 示例：reverb: { wet: 0.5, impulse: 'path/to/impulse.wav' }
   */
  impulse?: string | ArrayBuffer | Blob | File;
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

/** 延迟效果选项 */
interface DelayOptions {
  /** 延迟时间 秒（默认 0.3） */
  time?: number;
  /** 反馈量 0-0.95（默认 0.4），越大回声越多 */
  feedback?: number;
  /** 干湿比 0-1（默认 0.4） */
  mix?: number;
  /** 反馈低通截止频率 Hz（可选，默认不滤波） */
  filterFreq?: number;
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
  /** 音量（0~1，默认 1） */
  volume?: number;
  /**
   * 循环播放。单一 API，按类型自动判断语义：
   *   布尔 → 是否无限循环
   *   数字 → 总共播放的遍数
   * 任意负数、0、'inf'、'forever' 等均视为无限循环
   *
   * 示例：new Awdio({ type: 'sine', loop: 3 })    // 播放 3 遍
   *       new Awdio({ type: 'sine', loop: true }) // 无限循环
   *       Awdio.queue(a, b, { loop: 2 })          // 整队列播放 2 遍
   */
  loop?: boolean | number | string;
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
  /** 输出设备 ID 或设备 ID 数组（与 Awdio.setGlobalOutput 按时间戳比较，后调用者生效） */
  output?: string | string[];
  /** 立体声平衡 -1（最左）~ 1（最右），默认 0 */
  pan?: number;
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
  /** 微调音高 音分（默认 0），±100 = 一个半音 */
  detune?: number;
  /** 是否参与全局音频缓存（默认 true；同一 URL 只 fetch+解码一次） */
  cache?: boolean;
  /** 是否倒放（默认 false） */
  reverse?: boolean;
  /** 
   * 是否使用 HTML5 AudioElement 播放（默认自动判断）
   *
   * 判定顺序：
   *   1. 音波合成（type/formula）→ 强制 false（必须走 Web Audio 合成链）
   *   2. data URI → 强制 false（无需网络请求，直接解码）
   *   3. 小体积/未压缩格式（.wav/.wave/.ogg/.oga/.opus/.flac）→ false
   *   4. 其余（网络 URL、相对路径、同域路径、无扩展名 URL）→ true
   *
   * 相对路径与同域资源同样默认走 HTML5，可边下边播；
   * 若走 Web Audio 则需「整段 fetch + decodeAudioData」，
   * 大文件会有数秒首播延迟且整段缓冲区常驻内存。
   *
   * 设置为 true 可绕过 CORS 跨域限制，但无法使用 Web Audio 音效（reverb、filter 等）
   * HTML5 模式下 clip 片段和 output 设备路由同样生效
   * queue/playAll 中传入字符串 URL 会自动创建 html:true 的实例
   */
  html?: boolean;
  /** 
   * 切后台时是否暂停播放（默认 true）
   * true: 切后台暂停，切回前台恢复
   * false: 后台继续播放
   */
  pauseOnBack?: boolean;
  /**
   * MediaSession 媒体元数据（锁屏 / 通知栏 / 耳机遥控显示）
   *
   * 设置后，本实例播放时会自动推送到 navigator.mediaSession。
   * 另可用 `Awdio.setMediaSession()` 设置全局默认，或用实例方法
   * `.mediaSession()` 在播放过程中动态更新。
   *
   * 示例：new Awdio({ src: 'song.mp3', mediaSession: { title: '夜曲', artist: 'Chopin' } })
   */
  mediaSession?: MediaSessionOptions;
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
   * 注册播放完成回调（整个队列/并行组播放结束时触发）
   * @param fn - 回调函数，this 指向当前管理器
   * @param waitTime - 延迟多少毫秒后触发（从 end 时刻起算，默认 0）
   *
   * ⚠️ 与实例的 then 一样，本方法不是 Promise 的 then：返回 this，
   * 具备 thenable 外形。需要 Promise 语义请使用 toPromise()。
   *
   * 示例：Awdio.queue(a, b).then(() => console.log('队列播完了'))
   *       Awdio.queue(a, b).then(() => next(), 300)
   */
  then(fn: (self: AwdioManager) => void, waitTime?: number): this;

  /**
   * then 的语义化别名：明确表达「播放完成后执行」
   * @param fn - 回调函数，this 指向当前管理器
   * @param waitTime - 延迟多少毫秒后触发（默认 0）
   * @returns this
   */
  after(fn: (self: AwdioManager) => void, waitTime?: number): this;

  /**
   * after 的别名（更贴近 'end' 事件语义）
   * @param fn - 回调函数，this 指向当前管理器
   * @param waitTime - 延迟多少毫秒后触发（默认 0）
   * @returns this
   */
  onEnd(fn: (self: AwdioManager) => void, waitTime?: number): this;

  /**
   * 返回一个真正的 Promise，在整组播放完成（end）时 resolve
   *
   * ⚠️ 管理器同样是 thenable，故本方法 **resolve 为 true（原始值）**，
   * 实例请通过 onDone 回调获取，避免 thenable 采纳导致永久挂起。
   *
   * @param timeout - 可选超时（毫秒），超时后同样 resolve（不 reject）
   * @param onDone - 可选：结束时回调，参数为管理器本身
   * @returns Promise<true>
   *
   * 示例：await Awdio.queue(a, b).play().toPromise()
   */
  toPromise(timeout?: number, onDone?: (self: AwdioManager) => void): Promise<true>;

  /**
   * 设置/获取整个队列的循环方式（单一 API，按类型判断）
   * @param val - true 无限循环 / false 只播一遍；数字 n 表示整队列共播放 n 遍
   *              （任意负数、0、'inf'、'forever' 等均视为无限循环）
   * @returns 不传时读取：无限循环返回 true，否则返回总遍数；false 语义读取为 false
   *
   * 示例：mgr.loop()       // → true（无限）/ 3（播 3 遍）/ false（只播一遍）
   *       mgr.loop(true)  // 开启无限循环
   *       mgr.loop(3)     // 整队列播放 3 遍
   *
   * 注：如需得知「当前播到第几遍」，监听 'loop' / 'end' 事件的 data.count
   */
  loop(): boolean | number;
  loop(val: boolean | number | string | null): this;

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
   * 播放队列中指定位置（1-based，1 = 第一首）
   * @param index - 第几首
   *
   * 示例：mgr.setPlay(1)  // 播放队列第一首
   *       mgr.setPlay(3)  // 播放队列第三首
   */
  setPlay(index: number): this;

  /**
   * 下一首：相对当前曲目往后跳 n 首（缺省 1，越界回绕到队首）
   * @param n - 步数（默认 1）
   *
   * 示例：mgr.next()    // 下一首
   *       mgr.next(2)   // 下两首
   */
  next(n?: number): this;

  /**
   * 上一首：相对当前曲目往前跳 n 首（缺省 1，越界回绕到队尾）
   * @param n - 步数（默认 1）
   *
   * 示例：mgr.prev()    // 上一首
   *       mgr.prev(2)   // 上两首
   */
  prev(n?: number): this;

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

  // ==================== MediaSession（队列接管）====================

  /**
   * 设置/获取队列级媒体元数据（覆盖单项元数据）
   *
   * 队列播放时自动接管 mediaSession，并把媒体键映射为队列操作：
   *   play / pause / stop  → 队列 play / pause / stop
   *   nexttrack            → next()
   *   previoustrack        → prev()
   *   seekto / seekforward / seekbackward → 代理到当前播放项
   *
   * 示例：Awdio.queue(a, b).mediaSession({ title: '播放列表', artist: 'Awdio' }).play()
   */
  mediaSession(): MediaSessionOptions | null;
  mediaSession(opts: MediaSessionOptions | string | null | false): this;

  /** 当前播放位置（秒），代理到正在播放的实例 */
  readonly currentTime: number;

  /** 当前曲目时长（秒），代理到正在播放的实例 */
  readonly duration: number;

  /**
   * 跳转当前曲目位置（代理到正在播放的实例）
   * 支持 seek(10) / seek("1:30")
   */
  seek(time: number | string): this;
}

declare namespace Awdio {
  export { Awdio, AwdioManager };
  export {
    ReverbOptions, CompOptions, ChorusOptions, EnvelopeOptions, FilterOptions,
    WaveshaperOptions, PhaserOptions, DelayOptions, AnalyserOptions, PluckOptions,
    AwdioOptions, AwdioWaveType,
    MediaSessionOptions, ArtworkItem
  };
}

export = Awdio;
export as namespace Awdio;