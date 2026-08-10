/**
 * Awdio - 轻量级 Web Audio 音频库
 * 支持合成波形、公式自定义声音、3D 空间音频、网络/本地音频、队列播放、链式调用等
 * @version 3.10.0
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Awdio = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

class Awdio {
  // ==================== 静态属性 ====================
  static _counter = 0;
  static _instances = new Map();
  static _globalVolume = 100;
  static _globalGainNode = null;
  static _ctx = null;

  /** 用户自定义公式 */
  static _formulas = new Map();

  /** 已知波形类型列表 */
  static _waveTypes = [
    // 基础波形
    'sine', 'square', 'sawtooth', 'triangle', 'noise', 'pink',
    'cosine', 'tan', 'pulse',
    // 乐器模拟
    'organ', 'bell', 'guitar', 'piano', 'strings', 'brass', 'flute',
    'cello', 'violin', 'harp', 'marimba', 'vibraphone',
    // 管乐器
    'clarinet', 'oboe', 'bassoon', 'trumpet', 'trombone', 'tuba',
    // 打击乐
    'kick', 'snare', 'hihat', 'pluck', 'perc',
    'tom', 'clap', 'crash', 'ride', 'cowbell', 'rimshot',
    // FM 合成
    'epiano', 'fm_bell', 'fm_bass', 'fm_lead',
    // 模拟合成器
    'synth_bass', 'synth_lead', 'synth_pad', 'supersaw', 'sub_bass',
    // 效果音
    'laser', 'sweep', 'bubble', 'click'
  ];

  // ==================== 静态方法 ====================

  static getContext() {
    if (!Awdio._ctx) {
      Awdio._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return Awdio._ctx;
  }

  static getGlobalGainNode() {
    if (!Awdio._globalGainNode) {
      Awdio._globalGainNode = Awdio.getContext().createGain();
      Awdio._globalGainNode.gain.value = Awdio._globalVolume / 100;
      Awdio._globalGainNode.connect(Awdio.getContext().destination);
    }
    return Awdio._globalGainNode;
  }

  static setGlobalVolume(vol) {
    Awdio._globalVolume = Math.max(0, Math.min(100, vol));
    Awdio.getGlobalGainNode().gain.value = Awdio._globalVolume / 100;
  }

  static getGlobalVolume() {
    return Awdio._globalVolume;
  }

  /**
   * 获取所有音频输出设备
   * @returns {Promise<Array<{deviceId: string, label: string, groupId: string}>>}
   */
  static async getAllDevices() {
    // 先请求权限（getUserMedia 触发 enumerateDevices 返回完整标签）
    try {
      let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (e) {
      // 权限被拒，仍可枚举但 label 可能为空
    }
    let devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(d => d.kind === 'audiooutput')
      .map(d => ({ deviceId: d.deviceId, label: d.label, groupId: d.groupId }));
  }

  /**
   * 设置全局音频输出设备
   * @param {string|string[]} deviceId - 单个设备 ID 或设备 ID 数组
   *   单设备：Awdio.setGlobalOutput('default')  → 仅扬声器
   *   多设备：Awdio.setGlobalOutput(['id1', 'id2']) → 同时输出到多个设备
   *   无参：  Awdio.setGlobalOutput() → 恢复默认
   */
  static async setGlobalOutput(deviceId) {
    let ctx = Awdio.getContext();

    // 清理旧的多设备输出
    if (Awdio._multiOutputNodes) {
      Awdio._multiOutputNodes.forEach(n => {
        try { n.audioEl.pause(); n.audioEl.srcObject = null; n.audioEl.remove(); } catch (e) {}
        try { n.destNode.disconnect(); } catch (e) {}
      });
      Awdio._multiOutputNodes = null;
    }

    if (deviceId === undefined || deviceId === null) {
      // 恢复默认
      Awdio._outputDeviceId = null;
      Awdio.getGlobalGainNode().disconnect();
      Awdio.getGlobalGainNode().connect(ctx.destination);
      return;
    }

    if (Array.isArray(deviceId)) {
      // 多设备输出
      Awdio._outputDeviceId = deviceId;
      Awdio._multiOutputNodes = [];

      let gainNode = Awdio.getGlobalGainNode();
      gainNode.disconnect();
      gainNode.connect(ctx.destination); // 保留默认输出

      for (let id of deviceId) {
        if (id === 'default') continue; // 默认已连
        let destNode = ctx.createMediaStreamDestination();
        gainNode.connect(destNode);

        let audioEl = document.createElement('audio');
        audioEl.muted = false;
        audioEl.autoplay = true;
        audioEl.srcObject = destNode.stream;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);

        try {
          if (audioEl.setSinkId) {
            await audioEl.setSinkId(id);
          }
        } catch (e) {
          console.warn('Awdio: setSinkId 失败，设备可能不支持:', id, e);
        }

        Awdio._multiOutputNodes.push({ destNode, audioEl });
      }
    } else {
      // 单设备输出
      Awdio._outputDeviceId = deviceId;
      if (ctx.setSinkId) {
        try {
          await ctx.setSinkId(deviceId);
        } catch (e) {
          console.warn('Awdio: setSinkId 失败，设备可能不支持:', deviceId, e);
        }
      } else {
        console.warn('Awdio: 当前浏览器不支持 AudioContext.setSinkId');
      }
    }
  }

  static getInstance(name) {
    return Awdio._instances.get(name) || null;
  }

  static getOption(name) {
    let inst = Awdio._instances.get(name);
    return inst ? inst.getOption() : null;
  }

  static destroy(name) {
    let inst = Awdio._instances.get(name);
    if (inst) inst.destroy();
  }

  /**
   * 定义自定义声音公式
   * @param {string} name - 公式名称
   * @param {function} fn  - 公式函数 fn(t, freq, sr, opts)
   *   参数: t=当前时间(秒), freq=基频, sr=采样率, opts=当前实例选项
   *   返回: -1~1 的采样值
   * 示例: Awdio.defineFormula('myWave', (t, freq, sr) => Math.sin(2*Math.PI*freq*t) * Math.exp(-t*2))
   */
  static defineFormula(name, fn) {
    Awdio._formulas.set(name, fn);
    // 同时加入 waveTypes 以便字符串识别
    if (!Awdio._waveTypes.includes(name)) {
      Awdio._waveTypes.push(name);
    }
  }

  /**
   * MIDI 音符转频率
   * @param {number} note - MIDI 音符编号（69=A4=440Hz）
   * @returns {number} 频率 (Hz)
   * 示例：Awdio.midicps(69) → 440，Awdio.midicps(60) → 261.63 (C4)
   */
  static midicps(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  /**
   * 设置 3D 空间音频监听者位置/朝向
   * @param {object} opts
   *   opts.x, opts.y, opts.z          - 监听者位置
   *   opts.forwardX, opts.forwardY, opts.forwardZ - 前方向量
   *   opts.upX, opts.upY, opts.upZ    - 上方向量
   */
  static listener(opts) {
    let ctx = Awdio.getContext();
    let l = ctx.listener;
    if (opts.x != null) { l.positionX.value = opts.x; }
    if (opts.y != null) { l.positionY.value = opts.y; }
    if (opts.z != null) { l.positionZ.value = opts.z; }
    if (opts.forwardX != null) { l.forwardX.value = opts.forwardX; }
    if (opts.forwardY != null) { l.forwardY.value = opts.forwardY; }
    if (opts.forwardZ != null) { l.forwardZ.value = opts.forwardZ; }
    if (opts.upX != null) { l.upX.value = opts.upX; }
    if (opts.upY != null) { l.upY.value = opts.upY; }
    if (opts.upZ != null) { l.upZ.value = opts.upZ; }
  }

  static _isURL(str) {
    return /^(https?:)?\/\//.test(str);
  }

  static _isDataURI(str) {
    return /^data:/.test(str);
  }

  static _isWaveType(str) {
    return Awdio._waveTypes.includes(str) || Awdio._formulas.has(str);
  }

  static _parseTime(time) {
    if (typeof time === 'number') return Math.max(0, time);
    if (typeof time === 'string') {
      let parts = time.split(':').map(Number);
      if (parts.length === 1) return Math.max(0, parts[0]);
      if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
      if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
    }
    return 0;
  }

  static _resolve(item) {
    if (item instanceof Awdio) return item;
    if (typeof item === 'function') return new Awdio({ type: item });
    if (typeof item === 'string') {
      let existing = Awdio._instances.get(item);
      if (existing) return existing;
      return new Awdio(item);
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return new Awdio(item);
    }
    return null;
  }

  /**
   * 解析混合参数列表（实例 + 延迟数字）
   * 返回 [{ item, delayAfter }] 和全局 opts
   */
  static _parseQueueArgs(args) {
    let opts = {};
    let raw = [...args];

    // 末尾是选项对象则提取
    let last = raw[raw.length - 1];
    if (last && typeof last === 'object' && !Array.isArray(last) && !(last instanceof Awdio) && typeof last !== 'function') {
      let hasQueueOpts = ['loop', 'delay', 'fade', 'fadeIn', 'fadeOut', 'fadeDuration', 'fadeInDuration', 'fadeOutDuration', 'autoplay'].some(k => k in last);
      if (hasQueueOpts) {
        opts = raw.pop();
      }
    }

    let entries = [];
    let pendingDelay = 0;

    for (let val of raw) {
      if (typeof val === 'number') {
        pendingDelay += val;
      } else {
        let inst = Awdio._resolve(val);
        if (inst) {
          entries.push({ item: inst, delayAfter: pendingDelay });
          pendingDelay = 0;
        }
      }
    }

    // 剩余数字作为末尾延迟
    if (pendingDelay > 0) {
      entries.push({ item: null, delayAfter: pendingDelay });
    }

    return { entries, opts };
  }

  static queue(...args) {
    let entries, opts = {};

    if (Array.isArray(args[0])) {
      // 数组形式：支持逐项数字延迟 [aw1, 200, aw2, 100, aw3]
      // 数字跟在 item 后面表示该 item 的逐项延迟，叠加到全局 delay
      let raw = args[0];
      if (args[1] && typeof args[1] === 'object' && !Array.isArray(args[1])) {
        opts = args[1];
      }

      let globalDelay = opts.delay || 0;
      entries = [];
      let pendingDelay = 0;

      for (let val of raw) {
        if (typeof val === 'number') {
          pendingDelay += val;
        } else {
          let inst = Awdio._resolve(val);
          if (inst) {
            entries.push({ item: inst, delayAfter: pendingDelay + globalDelay });
            pendingDelay = 0;
          }
        }
      }
      // 末尾数字
      if (pendingDelay > 0) {
        entries.push({ item: null, delayAfter: pendingDelay + globalDelay });
      }
    } else {
      // 扁平形式：awdio.queue(100, aw1, 200, aw2, 300)
      let parsed = Awdio._parseQueueArgs(args);
      entries = parsed.entries;
      opts = parsed.opts;
    }

    let instances = entries.filter(e => e.item).map(e => e.item);
    let mgr = new _AwdioManager(instances, opts, 'sequential');
    // 注入逐项延迟
    mgr._perItemDelays = entries.map(e => e.delayAfter);
    return mgr;
  }

  static playAll(...args) {
    let entries, opts = {};

    if (Array.isArray(args[0])) {
      let raw = args[0];
      if (args[1] && typeof args[1] === 'object' && !Array.isArray(args[1])) {
        opts = args[1];
      }

      let globalDelay = opts.delay || 0;
      entries = [];
      let pendingDelay = 0;

      for (let val of raw) {
        if (typeof val === 'number') {
          pendingDelay += val;
        } else {
          let inst = Awdio._resolve(val);
          if (inst) {
            entries.push({ item: inst, delayAfter: pendingDelay + globalDelay });
            pendingDelay = 0;
          }
        }
      }
      if (pendingDelay > 0) {
        entries.push({ item: null, delayAfter: pendingDelay + globalDelay });
      }
    } else {
      let parsed = Awdio._parseQueueArgs(args);
      entries = parsed.entries;
      opts = parsed.opts;
    }

    let instances = entries.filter(e => e.item).map(e => e.item);
    let mgr = new _AwdioManager(instances, opts, 'parallel');
    mgr._perItemDelays = entries.map(e => e.delayAfter);
    return mgr;
  }

  // ==================== 构造函数 ====================

  constructor(arg1, arg2) {
    this._ctx = Awdio.getContext();

    // ---- 音效链：source -> _chainInput -> [_envelopeNode] -> [filter] -> [comp] -> [reverb] -> [chorus] -> [panner] -> _gainNode -> globalGain -> dest ----
    this._chainInput = this._ctx.createGain();
    this._chainInput.gain.value = 1;

    this._envelopeNode = null;        // ADSR 包络节点（可选）
    this._envelope = null;            // ADSR 配置

    this._gainNode = this._ctx.createGain();
    this._gainNode.gain.value = 1;

    this._device = null;           // 实例级输出设备（null | string | string[]）
    this._deviceOutputs = null;    // 设备输出节点列表
    this._chainConnected = false;  // 增益链是否已连接到全局输出（按需连接，闲置断开）

    this._chainInput.connect(this._gainNode);

    this._filterNode = null;
    this._compNode = null;
    this._compGainNode = null;
    this._reverbNode = null;
    this._reverbDry = null;
    this._reverbWet = null;
    this._chorusNode = null;
    this._chorusDry = null;
    this._chorusWet = null;
    this._chorusDelay = null;
    this._chorusLFO = null;
    this._waveshaperNode = null;
    this._phaserNode = null;
    this._phaserDry = null;
    this._phaserWet = null;
    this._phaserLFOs = null;
    this._stereoPanner = null;
    this._pannerNode = null;

    // 解析参数：支持函数作为 formula
    let opts = {};
    if (typeof arg1 === 'function') {
      opts = { type: arg1 };
    } else if (typeof arg1 === 'string') {
      if (Awdio._isURL(arg1)) {
        opts = { src: arg1 };
      } else if (Awdio._isWaveType(arg1)) {
        opts = { type: arg1 };
      } else {
        opts = { src: arg1 };
      }
      if (arg2 && typeof arg2 === 'object' && !Array.isArray(arg2)) {
        opts = Object.assign(opts, arg2);
      }
    } else if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1)) {
      opts = arg1;
    }

    // 初始化属性
    this._src = opts.src || null;
    this._formula = opts.formula || null;
    this._type = opts.type || null;
    // 如果 type 是注册的公式名，回填 _formula
    if (this._type && typeof this._type === 'string' && Awdio._formulas.has(this._type)) {
      this._formula = Awdio._formulas.get(this._type);
    } else if (!this._formula && typeof this._type === 'function') {
      this._formula = this._type;
    }
    this._freq = opts.freq || 440;
    this._duration = opts.duration != null ? opts.duration : 2;
    this._volume = opts.volume != null ? opts.volume : 100;
    this._loop = opts.loop != null ? opts.loop : false;
    this._poly = opts.poly || false;
    this._autoplay = opts.autoplay || false;
    this._autoDestroy = opts.autoDestroy || false; // 播放完毕后自动销毁
    this._muted = opts.muted || false;
    this._fade = opts.fade || false;
    this._fadeIn = opts.fade != null ? !!opts.fade : (opts.fadeIn || false);
    this._fadeOut = opts.fade != null ? !!opts.fade : (opts.fadeOut || false);
    this._fadeDuration = opts.fadeDuration || 1;
    this._fadeInDuration = opts.fadeInDuration || opts.fadeDuration || 1;
    this._fadeOutDuration = opts.fadeOutDuration || opts.fadeDuration || 1;
    this._speed = opts.speed != null ? Math.max(0.1, Math.min(10, opts.speed)) : 1;
    this._pitch = opts.pitch != null ? Math.max(0.1, Math.min(10, opts.pitch)) : 1;
    this._reverse = opts.reverse || false;
    this._a = opts.a != null ? Math.max(0, opts.a) : 0.01;
    this._r = opts.r != null ? Math.max(0, opts.r) : 0.3;
    this._params = {}; // 通用参数存储

    // 命名
    this._name = opts.name || ('awdio_' + (++Awdio._counter));

    // 注册实例
    Awdio._instances.set(this._name, this);

    // 内部状态
    this._buffer = null;
    this._activeSources = [];
    this._events = {};
    this._pausedAt = null;
    this._delayMs = 0;
    this._destroyed = false;
    this._wasPlayingBeforeHidden = false;
    this._isLoading = false;
    this._releasing = false;
    this._releaseTimeoutId = null;
    this._reversedBuffer = null;

    // 实例级设备
    if (opts.device) {
      this._device = opts.device;
      this._applyDeviceRouting();
    }

    // 应用音量
    this._applyVolume();

    // 加载或合成：优先级 src > formula > type
    if (this._src) {
      this._load();
    } else if (this._formula) {
      this._buffer = this._createBuffer(this._formula, this._freq);
      if (this._autoplay) this._play();
    } else if (this._type) {
      this._buffer = this._createBuffer(this._type, this._freq);
      if (this._autoplay) this._play();
    }

    this._bindVisibility();
  }

  // ==================== 音效链 ====================

  _rebuildChain() {
    this._chainInput.disconnect();
    if (this._envelopeNode) this._envelopeNode.disconnect();
    if (this._waveshaperNode) this._waveshaperNode.disconnect();
    if (this._filterNode) this._filterNode.disconnect();
    if (this._compNode) this._compNode.disconnect();
    if (this._compGainNode) this._compGainNode.disconnect();
    if (this._reverbDry) this._reverbDry.disconnect();
    if (this._reverbWet) this._reverbWet.disconnect();
    if (this._reverbNode) this._reverbNode.disconnect();
    if (this._chorusDry) this._chorusDry.disconnect();
    if (this._chorusWet) this._chorusWet.disconnect();
    if (this._chorusDelay) this._chorusDelay.disconnect();
    if (this._chorusNode) this._chorusNode.disconnect();
    if (this._phaserDry) this._phaserDry.disconnect();
    if (this._phaserWet) this._phaserWet.disconnect();
    if (this._phaserNode) this._phaserNode.disconnect();
    if (this._stereoPanner) this._stereoPanner.disconnect();
    if (this._pannerNode) this._pannerNode.disconnect();
    this._gainNode.disconnect();

    let prev = this._chainInput;

    // ADSR 包络（可选，在效果链之前）
    if (this._envelopeNode) {
      prev.connect(this._envelopeNode);
      prev = this._envelopeNode;
    }

    // 波形塑形（失真）
    if (this._waveshaperNode) {
      prev.connect(this._waveshaperNode);
      prev = this._waveshaperNode;
    }

    if (this._filterNode) {
      prev.connect(this._filterNode);
      prev = this._filterNode;
    }

    if (this._compNode && this._compGainNode) {
      prev.connect(this._compNode);
      this._compNode.connect(this._compGainNode);
      prev = this._compGainNode;
    }

    if (this._reverbDry && this._reverbWet && this._reverbNode) {
      prev.connect(this._reverbDry);
      prev.connect(this._reverbNode);
      this._reverbNode.connect(this._reverbWet);
      this._reverbDry.connect(this._gainNode);
      this._reverbWet.connect(this._gainNode);
      prev = null;
    }

    if (prev && this._chorusNode && this._chorusDry && this._chorusWet && this._chorusDelay) {
      prev.connect(this._chorusDry);
      prev.connect(this._chorusDelay);
      this._chorusDelay.connect(this._chorusWet);
      this._chorusDry.connect(this._chorusNode);
      this._chorusWet.connect(this._chorusNode);
      prev = this._chorusNode;
    }

    // 移相效果
    if (prev && this._phaserNode && this._phaserDry && this._phaserWet) {
      prev.connect(this._phaserDry);
      prev.connect(this._phaserWet);
      this._phaserDry.connect(this._phaserNode);
      this._phaserWet.connect(this._phaserNode);
      prev = this._phaserNode;
    }

    // 3D 空间定位
    if (prev && this._pannerNode) {
      prev.connect(this._pannerNode);
      prev = this._pannerNode;
    }

    // 立体声平衡（在 3D panner 之后，因为 3D 输出是单声道定位流）
    if (prev && this._stereoPanner) {
      prev.connect(this._stereoPanner);
      prev = this._stereoPanner;
    }

    if (prev) {
      prev.connect(this._gainNode);
    }

    this._applyDeviceRouting();
  }

  /**
   * 将 _gainNode 路由到正确的输出（全局 || 实例级设备）
   */
  async _applyDeviceRouting() {
    let ctx = this._ctx;

    // 清理旧设备输出
    if (this._deviceOutputs) {
      this._deviceOutputs.forEach(o => {
        try { o.audioEl.pause(); o.audioEl.srcObject = null; o.audioEl.remove(); } catch (e) {}
        try { o.destNode.disconnect(); } catch (e) {}
      });
      this._deviceOutputs = null;
    }

    // 断开所有输出连接（全局 + 设备）
    this._gainNode.disconnect();

    // 仅当播放中时才重新连接到全局输出（否则由 _ensureChainConnected 在播放时连接）
    let wasConnected = this._chainConnected;
    if (wasConnected) {
      this._gainNode.connect(Awdio.getGlobalGainNode());
    }

    if (!this._device) {
      this._chainConnected = wasConnected;
      return;
    }

    let ids = Array.isArray(this._device) ? this._device : [this._device];
    this._deviceOutputs = [];

    for (let id of ids) {
      if (id === 'default') continue;
      let destNode = ctx.createMediaStreamDestination();
      this._gainNode.connect(destNode);

      let audioEl = document.createElement('audio');
      audioEl.muted = false;
      audioEl.autoplay = true;
      audioEl.srcObject = destNode.stream;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);

      try {
        if (audioEl.setSinkId) {
          await audioEl.setSinkId(id);
        }
      } catch (e) {
        console.warn('Awdio: 实例设备 setSinkId 失败:', id, e);
      }

      this._deviceOutputs.push({ destNode, audioEl });
    }
  }

  /**
   * 确保增益链已连接到全局输出（按需连接，避免闲置节点泄漏）
   */
  _ensureChainConnected() {
    if (!this._chainConnected) {
      this._gainNode.connect(Awdio.getGlobalGainNode());
      this._chainConnected = true;
    }
  }

  /**
   * 断开增益链与全局输出的连接（释放 AudioContext 节点资源）
   * 保留 _gainNode 本身及其内部效果链，仅断开到全局输出的连线
   */
  _disconnectFromOutput() {
    if (this._chainConnected && this._activeSources.length === 0) {
      this._gainNode.disconnect(Awdio.getGlobalGainNode());
      this._chainConnected = false;
    }
  }

  // ==================== 可见性处理 ====================

  _bindVisibility() {
    this._visibilityHandler = () => {
      if (document.hidden) {
        if (this.playing) {
          this._wasPlayingBeforeHidden = true;
          this._pauseInternal();
        }
      } else {
        if (this._wasPlayingBeforeHidden) {
          this._wasPlayingBeforeHidden = false;
          this._play();
        }
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
    this._pageHideHandler = () => {
      if (this.playing) {
        this._wasPlayingBeforeHidden = true;
        this._pauseInternal();
      }
    };
    window.addEventListener('pagehide', this._pageHideHandler);
  }

  _unbindVisibility() {
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
    }
    if (this._pageHideHandler) {
      window.removeEventListener('pagehide', this._pageHideHandler);
    }
  }

  // ==================== 事件系统 ====================

  on(event, fn) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(fn);
    return this;
  }

  off(event, fn) {
    if (!this._events[event]) return this;
    this._events[event] = this._events[event].filter(f => f !== fn);
    return this;
  }

  _emit(event, data = {}) {
    if (!this._events[event]) return;
    this._events[event].forEach(fn => {
      try { fn.call(this, data); } catch (e) { console.error('Awdio event error:', e); }
    });
  }

  // ==================== 加载音频 ====================

  async _load() {
    if (this._isLoading) return;
    this._isLoading = true;
    try {
      let buf;
      if (Awdio._isDataURI(this._src)) {
        let base64Match = this._src.match(/;base64,(.+)$/);
        if (base64Match) {
          let binaryStr = atob(base64Match[1]);
          buf = new ArrayBuffer(binaryStr.length);
          let view = new Uint8Array(buf);
          for (let i = 0; i < binaryStr.length; i++) {
            view[i] = binaryStr.charCodeAt(i);
          }
        } else {
          let dataMatch = this._src.match(/^data:[^,]*,/);
          if (dataMatch) {
            let text = this._src.slice(dataMatch[0].length);
            let encoder = new TextEncoder();
            buf = encoder.encode(text).buffer;
          } else {
            throw new Error('无法解析 data URI');
          }
        }
      } else {
        let resp = await fetch(this._src);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        // 流式读取 + 进度回调
        let contentLength = resp.headers.get('content-length');
        let total = contentLength ? parseInt(contentLength, 10) : 0;
        let reader = resp.body.getReader();
        let chunks = [];
        let loaded = 0;
        while (true) {
          let { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          if (total > 0) {
            this._emit('progress', { loaded, total, percent: Math.round(loaded / total * 100) });
          }
        }
        // 合并 chunks
        buf = new ArrayBuffer(loaded);
        let view = new Uint8Array(buf);
        let pos = 0;
        for (let chunk of chunks) {
          view.set(chunk, pos);
          pos += chunk.length;
        }
      }
      this._buffer = await this._ctx.decodeAudioData(buf);
      this._isLoading = false;
      this._emit('load', { src: this._src });
      if (this._autoplay) this._play();
    } catch (e) {
      this._isLoading = false;
      console.error('Awdio: 加载音频失败', e);
      this._emit('error', { error: e, src: this._src });
    }
  }

  // ==================== 合成音频 ====================

  /**
   * 统一入口：根据 type 创建缓冲区
   * 支持函数（公式）、注册的公式名、内置波形类型
   */
  _createBuffer(type, freq, duration) {
    if (duration === undefined) duration = this._duration || 2;
    // 1. 函数类型 → 直接作为公式
    if (typeof type === 'function') {
      return this._createFormulaBuffer(type, freq, duration);
    }
    // 2. 注册的公式名
    if (Awdio._formulas.has(type)) {
      return this._createFormulaBuffer(Awdio._formulas.get(type), freq, duration);
    }
    // 3. 内置波形类型
    return this._createSyntheticBuffer(type, freq, duration);
  }

  /**
   * 公式缓冲区：逐采样点调用 fn(t, freq, sr, opts)
   */
  _createFormulaBuffer(fn, freq, duration) {
    let sr = this._ctx.sampleRate;
    let len = Math.floor(sr * duration);
    let buffer = this._ctx.createBuffer(1, len, sr);
    let data = buffer.getChannelData(0);
    let opts = this.getOption();
    for (let i = 0; i < len; i++) {
      let t = i / sr;
      let val = fn(t, freq, sr, opts);
      data[i] = Math.max(-1, Math.min(1, val));
    }
    return buffer;
  }

  _createSyntheticBuffer(type, freq, duration = 2) {
    let sr = this._ctx.sampleRate;
    let len = Math.floor(sr * duration);
    let buffer = this._ctx.createBuffer(1, len, sr);
    let data = buffer.getChannelData(0);

    // Karplus-Strong 类型
    if (type === 'guitar' || type === 'pluck' || type === 'harp' || type === 'marimba' || type === 'vibraphone') {
      let decayMap = { guitar: 0.996, pluck: 0.99, harp: 0.997, marimba: 0.998, vibraphone: 0.999 };
      let decay = decayMap[type] || 0.99;
      let ksData = this._karplusStrong(freq, sr, duration, decay);
      if (ksData === 0) {
        for (let i = 0; i < len; i++) data[i] = Math.sin(2 * Math.PI * freq * i / sr);
      } else {
        let ksLen = Math.min(ksData.length, len);
        for (let i = 0; i < ksLen; i++) data[i] = ksData[i];
      }
      if (type === 'vibraphone') {
        for (let i = 0; i < len; i++) {
          let t = i / sr;
          data[i] *= (1 + 0.003 * Math.sin(2 * Math.PI * 6 * t));
        }
      }
      return buffer;
    }

    for (let i = 0; i < len; i++) {
      let t = i / sr;
      let phase = (freq * t) % 1;
      let sample = 0;

      switch (type) {
        // ========== 基础波形 ==========
        case 'sine':
          sample = Math.sin(2 * Math.PI * freq * t);
          break;
        case 'cosine':
          sample = Math.cos(2 * Math.PI * freq * t);
          break;
        case 'square':
          sample = phase < 0.5 ? 1 : -1;
          break;
        case 'sawtooth':
          sample = 2 * (phase - 0.5);
          break;
        case 'triangle':
          sample = 1 - 4 * Math.abs(phase - 0.5);
          break;
        case 'noise':
          sample = Math.random() * 2 - 1;
          break;
        case 'pink':
          // 粉红噪声：每八度能量递减，用 Voss-McCartney 算法
          this._pinkState = this._pinkState || { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 };
          let white = Math.random() * 2 - 1;
          this._pinkState.b0 = 0.99886 * this._pinkState.b0 + white * 0.0555179;
          this._pinkState.b1 = 0.99332 * this._pinkState.b1 + white * 0.0750759;
          this._pinkState.b2 = 0.96900 * this._pinkState.b2 + white * 0.1538520;
          this._pinkState.b3 = 0.86650 * this._pinkState.b3 + white * 0.3104856;
          this._pinkState.b4 = 0.55000 * this._pinkState.b4 + white * 0.5329522;
          this._pinkState.b5 = -0.7616 * this._pinkState.b5 - white * 0.0168980;
          sample = (this._pinkState.b0 + this._pinkState.b1 + this._pinkState.b2 + this._pinkState.b3 + this._pinkState.b4 + this._pinkState.b5 + this._pinkState.b6 + white * 0.5362) * 0.11;
          this._pinkState.b6 = white * 0.115926;
          break;
        case 'tan':
          sample = Math.tan(2 * Math.PI * freq * t);
          sample = Math.max(-1, Math.min(1, sample));
          break;
        case 'pulse':
          sample = phase < 0.25 ? 1 : -1;
          break;

        // ========== 乐器模拟 ==========
        case 'organ':
          sample = Math.sin(2 * Math.PI * freq * t) * 0.6 + Math.sin(4 * Math.PI * freq * t) * 0.3 + Math.sin(6 * Math.PI * freq * t) * 0.1;
          break;
        case 'bell':
          sample = (Math.sin(2 * Math.PI * freq * t) * 0.5 + Math.sin(2 * Math.PI * freq * 2.76 * t) * 0.3 + Math.sin(2 * Math.PI * freq * 5.4 * t) * 0.2) * Math.exp(-t * 3);
          break;
        case 'piano':
          sample = (Math.sin(2 * Math.PI * freq * t) * 0.5 + Math.sin(4 * Math.PI * freq * t) * 0.25 + Math.sin(8 * Math.PI * freq * t) * 0.125 + Math.sin(12 * Math.PI * freq * t) * 0.1) * Math.exp(-t * 2);
          break;
        case 'strings':
          sample = 2 * (phase - 0.5) * 0.7 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.2 + Math.sin(2 * Math.PI * freq * 3 * t) * 0.1;
          break;
        case 'brass':
          sample = (phase < 0.5 ? 1 : -1) * 0.6 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.3 + Math.sin(2 * Math.PI * freq * 3 * t) * 0.1;
          break;
        case 'flute':
          sample = Math.sin(2 * Math.PI * freq * t) * 0.7 + Math.sin(4 * Math.PI * freq * t) * 0.2 + Math.sin(6 * Math.PI * freq * t) * 0.1;
          break;
        case 'violin':
        case 'cello':
          let vibFreq = type === 'violin' ? 5 : 3;
          let vibDepth = type === 'violin' ? 0.003 : 0.002;
          sample = (2 * (phase - 0.5) * 0.6 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.25 + Math.sin(2 * Math.PI * freq * 3 * t) * 0.15) * (1 + vibDepth * Math.sin(2 * Math.PI * vibFreq * t));
          break;

        // ========== 管乐器 ==========
        case 'clarinet':
          sample = (Math.sin(2 * Math.PI * freq * t) * 0.5 + Math.sin(6 * Math.PI * freq * t) * 0.25 + Math.sin(10 * Math.PI * freq * t) * 0.15 + Math.sin(14 * Math.PI * freq * t) * 0.1) * (1 + 0.002 * Math.sin(2 * Math.PI * 4 * t));
          break;
        case 'oboe':
          sample = Math.sin(2 * Math.PI * freq * t) * 0.3 + Math.sin(4 * Math.PI * freq * t) * 0.25 + Math.sin(6 * Math.PI * freq * t) * 0.2 + Math.sin(8 * Math.PI * freq * t) * 0.15 + Math.sin(10 * Math.PI * freq * t) * 0.1;
          break;
        case 'bassoon':
          sample = (Math.sin(2 * Math.PI * freq * t) * 0.4 + Math.sin(4 * Math.PI * freq * t) * 0.3 + Math.sin(6 * Math.PI * freq * t) * 0.2 + Math.sin(8 * Math.PI * freq * t) * 0.1) * (1 + 0.002 * Math.sin(2 * Math.PI * 3 * t));
          break;
        case 'trumpet':
          let tpEnv = Math.min(1, t * 20);
          sample = tpEnv * ((phase < 0.5 ? 1 : -1) * 0.5 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.3 + Math.sin(2 * Math.PI * freq * 3 * t) * 0.15 + Math.sin(2 * Math.PI * freq * 4 * t) * 0.05);
          break;
        case 'trombone':
          sample = (phase < 0.5 ? 1 : -1) * 0.55 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.25 + Math.sin(2 * Math.PI * freq * 3 * t) * 0.15 + Math.sin(2 * Math.PI * freq * 5 * t) * 0.05;
          break;
        case 'tuba':
          sample = Math.sin(2 * Math.PI * freq * t) * 0.5 + Math.sin(4 * Math.PI * freq * t) * 0.3 + Math.sin(6 * Math.PI * freq * t) * 0.15 + Math.sin(8 * Math.PI * freq * t) * 0.05;
          break;

        // ========== 打击乐 ==========
        case 'kick':
          sample = Math.sin(2 * Math.PI * Math.max(20, freq * (1 - t * 8)) * t) * Math.exp(-t * 12);
          break;
        case 'snare':
          sample = (Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.5 + (Math.random() * 2 - 1) * 0.5) * Math.exp(-t * 8);
          break;
        case 'hihat':
          sample = (Math.random() * 2 - 1) * Math.exp(-t * 20);
          break;
        case 'perc':
          // 通用打击乐：白噪声包络 + 正弦混合
          sample = ((Math.random() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.4) * Math.exp(-t * 10);
          break;
        case 'tom':
          sample = (Math.sin(2 * Math.PI * Math.max(30, freq * (1 - t * 3)) * t) * 0.6 + (Math.random() * 2 - 1) * 0.1) * Math.exp(-t * 6);
          break;
        case 'clap':
          sample = (Math.random() * 2 - 1) * Math.exp(-t * 15) * (1 + 0.5 * (((t * 100) % 1) < 0.1 ? 1 : 0));
          break;
        case 'crash':
          sample = (Math.random() * 2 - 1) * Math.exp(-t * 2.5) * (1 + 0.3 * Math.sin(2 * Math.PI * freq * 3 * t));
          break;
        case 'ride':
          sample = (Math.random() * 2 - 1) * 0.7 * Math.exp(-t * 8) + Math.sin(2 * Math.PI * freq * 6 * t) * 0.3 * Math.exp(-t * 8);
          break;
        case 'cowbell':
          sample = (Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.5 + Math.sin(2 * Math.PI * freq * 2.3 * t) * 0.5) * Math.exp(-t * 10);
          break;
        case 'rimshot':
          sample = (Math.sin(2 * Math.PI * freq * 2 * t) * 0.4 + (Math.random() * 2 - 1) * 0.6) * Math.exp(-t * 25);
          break;

        // ========== FM 合成 ==========
        case 'epiano':
          sample = Math.sin(2 * Math.PI * freq * t * (1 + Math.sin(2 * Math.PI * freq * 14 * t) * 0.7)) * 0.5 * Math.exp(-t * 1.5);
          break;
        case 'fm_bell':
          sample = Math.sin(2 * Math.PI * freq * t * (1 + Math.sin(2 * Math.PI * freq * 5.7 * t) * 1.5)) * 0.4 * Math.exp(-t * 4);
          break;
        case 'fm_bass':
          sample = Math.sin(2 * Math.PI * freq * t * (1 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.8)) * 0.6;
          break;
        case 'fm_lead':
          sample = Math.sin(2 * Math.PI * freq * t * (1 + Math.sin(2 * Math.PI * freq * 3 * t) * 0.5)) * 0.5;
          break;

        // ========== 模拟合成器 ==========
        case 'synth_bass':
          sample = 2 * (phase - 0.5) * 0.7 + Math.sin(2 * Math.PI * freq * t) * 0.3 * Math.exp(-t * 0.5);
          break;
        case 'synth_lead':
          sample = (phase < (0.3 + 0.2 * Math.sin(2 * Math.PI * 0.5 * t)) ? 1 : -1) * 0.6 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.2;
          break;
        case 'synth_pad':
          sample = (Math.sin(2 * Math.PI * freq * t) * 0.4 + Math.sin(2 * Math.PI * freq * 1.005 * t) * 0.3 + Math.sin(2 * Math.PI * freq * 2.01 * t) * 0.2 + Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.1) * 0.7;
          break;
        case 'supersaw':
          sample = 0;
          for (let d = -3; d <= 3; d++) {
            let dp = (freq * (1 + d * 0.008) * t) % 1;
            sample += (2 * (dp - 0.5)) * (1 - Math.abs(d) * 0.15);
          }
          sample *= 0.2;
          break;
        case 'sub_bass':
          sample = (Math.sin(2 * Math.PI * freq * t) * 0.7 + Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.3) * Math.min(1, t * 50);
          break;

        // ========== 效果音 ==========
        case 'laser':
          sample = Math.sin(2 * Math.PI * freq * (1 + 4 * Math.exp(-t * 10)) * t) * 0.6 * Math.exp(-t * 5);
          break;
        case 'sweep':
          sample = Math.sin(2 * Math.PI * (freq * 0.2 + freq * 2 * (t / duration)) * t) * 0.5;
          break;
        case 'bubble':
          sample = Math.sin(2 * Math.PI * freq * (1 + 2 * Math.exp(-t * 8)) * t) * 0.5 * Math.exp(-t * 6);
          break;
        case 'click':
          sample = ((Math.random() * 2 - 1) * 0.3 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.5) * Math.exp(-t * 100);
          break;

        default:
          sample = Math.sin(2 * Math.PI * freq * t);
      }
      data[i] = sample;
    }
    return buffer;
  }

  _karplusStrong(freq, sr, duration, decay) {
    let period = Math.floor(sr / freq);
    if (period < 2) return 0;
    let len = Math.floor(sr * duration);
    let noise = new Float32Array(period);
    for (let i = 0; i < period; i++) noise[i] = (Math.random() * 2 - 1) * 0.5;
    let out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = i < period ? noise[i] : (out[i - period] + out[i - period + 1]) * 0.5 * decay;
    }
    return out;
  }

  // ==================== 内部播放 ====================

  _getReversedBuffer() {
    if (!this._buffer) return null;
    if (this._reversedBuffer && this._reversedBuffer._srcBuffer === this._buffer) {
      return this._reversedBuffer;
    }
    let orig = this._buffer;
    let numChannels = orig.numberOfChannels;
    let len = orig.length;
    let sr = orig.sampleRate;
    let reversed = this._ctx.createBuffer(numChannels, len, sr);
    for (let ch = 0; ch < numChannels; ch++) {
      let origData = orig.getChannelData(ch);
      let revData = reversed.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        revData[i] = origData[len - 1 - i];
      }
    }
    reversed._srcBuffer = this._buffer;
    this._reversedBuffer = reversed;
    return reversed;
  }

  _play() {
    if (this._destroyed) return;
    if (!this._buffer) {
      console.warn('Awdio: 音频尚未就绪');
      return;
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }

    // 按需连接增益链到全局输出（防止闲置节点泄漏）
    this._ensureChainConnected();

    if (!this._poly) {
      this._stopAllSources();
    }

    let source = this._ctx.createBufferSource();
    source.buffer = this._reverse ? this._getReversedBuffer() : this._buffer;
    source.loop = this._loop;
    source.playbackRate.value = this._speed * this._pitch;
    source.connect(this._chainInput);

    let now = this._ctx.currentTime;

    // ADSR 包络调度
    if (this._envelopeNode && this._envelope) {
      this._envelopeNode.gain.cancelScheduledValues(now);
      this._envelopeNode.gain.setValueAtTime(0, now);
      this._envelopeNode.gain.linearRampToValueAtTime(1, now + this._envelope.attack);
      this._envelopeNode.gain.linearRampToValueAtTime(this._envelope.sustain, now + this._envelope.attack + this._envelope.decay);
    }

    if (this._fadeIn && this._gainNode.gain) {
      this._gainNode.gain.cancelScheduledValues(now);
      this._gainNode.gain.setValueAtTime(0, now);
      this._gainNode.gain.linearRampToValueAtTime(
        this._muted ? 0 : (this._volume / 100),
        now + this._fadeInDuration
      );
    }

    let offset = this._pausedAt != null ? this._pausedAt : 0;
    source.start(0, offset);
    source.__startTime = this._ctx.currentTime - offset;

    this._activeSources.push(source);
    this._pausedAt = null;

    this._emit('play', { source });

    let onEnd = () => {
      let idx = this._activeSources.indexOf(source);
      if (idx !== -1) this._activeSources.splice(idx, 1);
      try { source.disconnect(); } catch (e) {}
      if (this._activeSources.length === 0) {
          this._emit('end');
          // 非循环非多音模式：播放完毕断开全局输出，释放音频图资源
          if (!this._loop && !this._poly) {
            this._disconnectFromOutput();
            // autoDestroy：播放完毕自动销毁实例，彻底释放所有节点
            if (this._autoDestroy) {
              this.destroy();
              return;
            }
          }
        }
    };

    if (!this._loop) {
      source.onended = onEnd;
    }
  }

  _pauseInternal() {
    // 淡出暂停
    if (this._fadeOut && this._activeSources.length > 0) {
      let now = this._ctx.currentTime;
      this._gainNode.gain.cancelScheduledValues(now);
      this._gainNode.gain.setValueAtTime(this._gainNode.gain.value, now);
      this._gainNode.gain.linearRampToValueAtTime(0, now + this._fadeOutDuration);
      let srcs = [...this._activeSources];
      setTimeout(() => {
        this._doPauseSources(srcs);
        this._applyVolume();
      }, this._fadeOutDuration * 1000 + 50);
      return;
    }
    this._doPauseCurrent();
  }

  _doPauseSources(srcs) {
    if (this._activeSources.length > 0) {
      this._pausedAt = this._ctx.currentTime - (srcs[0].__startTime || 0);
    }
    srcs.forEach(s => {
      try { s.onended = null; s.stop(); s.disconnect(); } catch (e) {}
    });
    this._activeSources = this._activeSources.filter(s => !srcs.includes(s));
  }

  _doPauseCurrent() {
    if (this._activeSources.length > 0) {
      this._pausedAt = this._ctx.currentTime - (this._activeSources[0].__startTime || 0);
    }
    this._activeSources.forEach(s => {
      try { s.onended = null; s.stop(); s.disconnect(); } catch (e) {}
    });
    this._activeSources = [];
  }

  _stopAllSources() {
    // ADSR 释放阶段
    if (this._envelopeNode && this._envelope && this._activeSources.length > 0 && !this._releasing) {
      this._releasing = true;
      let now = this._ctx.currentTime;
      this._envelopeNode.gain.cancelScheduledValues(now);
      this._envelopeNode.gain.setValueAtTime(this._envelopeNode.gain.value, now);
      this._envelopeNode.gain.linearRampToValueAtTime(0, now + this._envelope.release);
      if (this._releaseTimeoutId) clearTimeout(this._releaseTimeoutId);
      this._releaseTimeoutId = setTimeout(() => {
        this._releasing = false;
        this._doStopSources();
      }, this._envelope.release * 1000 + 50);
      return;
    }
    this._doStopSources();
  }

  _doStopSources() {
    this._releasing = false;
    this._activeSources.forEach(s => {
      try { s.onended = null; s.stop(); s.disconnect(); } catch (e) {}
    });
    this._activeSources = [];
  }

  // ==================== 公共播放控制 ====================

  play(arg) {
    if (this._destroyed) return this;

    if (arg !== undefined) {
      this._handleArg(arg);
    }

    if (this._delayMs > 0) {
      let delay = this._delayMs;
      this._delayMs = 0;
      setTimeout(() => this._play(), delay);
      return this;
    }

    this._play();
    return this;
  }

  pause(arg) {
    if (this._destroyed) return this;

    if (arg !== undefined) {
      this._handleArg(arg);
    }

    this._pauseInternal();
    this._emit('pause');
    return this;
  }

  stop(arg) {
    if (this._destroyed) return this;

    if (arg !== undefined) {
      this._handleArg(arg);
    }

    this._stopAllSources();
    this._pausedAt = 0;
    this._emit('stop');
    // 停止后断开全局输出，释放音频图资源
    this._disconnectFromOutput();
    return this;
  }

  seek(time) {
    let seconds = Awdio._parseTime(time);
    if (this._activeSources.length > 0) {
      let wasLooping = this._loop;
      this._loop = false;
      this._stopAllSources();
      this._pausedAt = seconds;
      this._play();
      this._loop = wasLooping;
    } else {
      this._pausedAt = Math.max(0, seconds);
    }
    return this;
  }

  // ==================== 选项设置 ====================

  /**
   * 设置选项（setOptions 已简化为 set）
   * 支持：.set({ volume: 50, loop: true })
   *      .set("sine") - 字符串形式设置波形
   *      .set("https://...") - 字符串形式设置 URL
   *      .set(fn) - 函数作为公式
   *      .set("myFormula") - 注册的公式名
   */
  set(arg) {
    if (this._destroyed) return this;

    if (typeof arg === 'function') {
      this._formula = arg;
      this._type = arg;
      this._src = null;
      this._buffer = this._createBuffer(arg, this._freq);
      return this;
    }

    if (typeof arg === 'string') {
      this._handleArg(arg);
      return this;
    }

    if (arg && typeof arg === 'object') {
      // 优先级：src > formula > type（同时存在时按此优先级选取）
      let hasSrc = arg.src !== undefined;
      let hasFormula = arg.formula !== undefined;
      let hasType = arg.type !== undefined;

      if (hasSrc) {
        // src 最高优先级：清除 formula 和 type
        this._src = arg.src;
        this._formula = null;
        this._type = null;
        this._load();
      } else if (hasFormula) {
        // formula 第二优先级
        this._formula = arg.formula;
        this._type = arg.formula;
        this._src = null;
        this._buffer = this._createBuffer(arg.formula, this._freq);
      } else if (hasType) {
        // type 第三优先级
        this._type = arg.type;
        this._src = null;
        if (typeof arg.type === 'function') {
          this._formula = arg.type;
        } else if (Awdio._formulas.has(arg.type)) {
          this._formula = Awdio._formulas.get(arg.type);
        } else {
          this._formula = null;
        }
        this._buffer = this._createBuffer(arg.type, this._freq);
      }
      if (arg.freq !== undefined) this._freq = arg.freq;
      if (arg.duration !== undefined) {
        this._duration = arg.duration;
        // 如果当前是合成音频（非 src 加载），重新生成 buffer
        if (!this._src && (this._formula || this._type)) {
          this._buffer = this._createBuffer(this._formula || this._type, this._freq);
        }
      }
      if (arg.volume !== undefined) this._volume = Math.max(0, Math.min(100, arg.volume));
      if (arg.loop !== undefined) this._loop = arg.loop;
      if (arg.poly !== undefined) this._poly = arg.poly;
      if (arg.autoplay !== undefined) this._autoplay = arg.autoplay;
      if (arg.autoDestroy !== undefined) this._autoDestroy = arg.autoDestroy;
      if (arg.muted !== undefined) this._muted = arg.muted;
      if (arg.fade !== undefined) {
        this._fade = !!arg.fade;
        this._fadeIn = this._fadeOut = !!arg.fade;
      }
      if (arg.fadeIn !== undefined) this._fadeIn = arg.fadeIn;
      if (arg.fadeOut !== undefined) this._fadeOut = arg.fadeOut;
      if (arg.fadeDuration !== undefined) {
        this._fadeDuration = arg.fadeDuration;
        this._fadeInDuration = this._fadeOutDuration = arg.fadeDuration;
      }
      if (arg.fadeInDuration !== undefined) this._fadeInDuration = arg.fadeInDuration;
      if (arg.fadeOutDuration !== undefined) this._fadeOutDuration = arg.fadeOutDuration;
      if (arg.speed !== undefined) this.speed(arg.speed);
      if (arg.pitch !== undefined) this.pitch(arg.pitch);
      if (arg.reverse !== undefined) this.reverse(arg.reverse);
      if (arg.a !== undefined) this._a = Math.max(0, arg.a);
      if (arg.r !== undefined) this._r = Math.max(0, arg.r);
      if (arg.device !== undefined) {
        this._device = arg.device;
        this._applyDeviceRouting();
      }

      this._applyVolume();
    }

    return this;
  }

  /**
   * 处理参数：函数 / 字符串 / 对象
   */
  _handleArg(arg) {
    if (typeof arg === 'function') {
      this._formula = arg;
      this._type = arg;
      this._src = null;
      this._buffer = this._createBuffer(arg, this._freq);
    } else if (typeof arg === 'string') {
      if (Awdio._isWaveType(arg)) {
        this._type = arg;
        this._formula = Awdio._formulas.get(arg) || null;
        this._buffer = this._createBuffer(arg, this._freq);
      } else if (Awdio._isURL(arg) || Awdio._isDataURI(arg)) {
        this._src = arg;
        this._formula = null;
        this._type = null;
        this._load();
      } else {
        this._src = arg;
        this._formula = null;
        this._type = null;
        this._load();
      }
    } else if (arg && typeof arg === 'object') {
      this.set(arg);
    }
  }

  setVolume(vol) {
    this._volume = Math.max(0, Math.min(100, vol));
    this._applyVolume();
    return this;
  }

  getVolume() {
    return this._volume;
  }

  mute(muted) {
    if (muted === undefined) {
      this._muted = !this._muted;
    } else {
      this._muted = !!muted;
    }
    this._applyVolume();
    this._emit('mute', { muted: this._muted });
    return this;
  }

  _applyVolume() {
    this._gainNode.gain.value = this._muted ? 0 : this._volume / 100;
  }

  // ==================== 增益运算 ====================

  /**
   * 设置/获取增益值（线性 0-1，控制 _gainNode 的增益）
   * @param {number} [val] - 增益值 0-1，不传获取当前值
   */
  gain(val) {
    if (val === undefined) return this._gainNode.gain.value;
    this._gainNode.gain.value = Math.max(0, Math.min(1, val));
    return this;
  }

  /**
   * 增益乘以系数
   * @param {number} val - 系数
   */
  mul(val) {
    this._gainNode.gain.value = Math.max(0, Math.min(1, this._gainNode.gain.value * val));
    return this;
  }

  /**
   * 增益除以系数
   * @param {number} val - 系数
   */
  div(val) {
    if (val === 0) return this;
    this._gainNode.gain.value = Math.max(0, Math.min(1, this._gainNode.gain.value / val));
    return this;
  }

  /**
   * 增益加上偏移量
   * @param {number} val - 偏移量
   */
  add(val) {
    this._gainNode.gain.value = Math.max(0, Math.min(1, this._gainNode.gain.value + val));
    return this;
  }

  /**
   * 增益减去偏移量
   * @param {number} val - 偏移量
   */
  sub(val) {
    this._gainNode.gain.value = Math.max(0, Math.min(1, this._gainNode.gain.value - val));
    return this;
  }

  // ==================== 命名系统 ====================

  setName(name) {
    if (this._destroyed) return this;
    Awdio._instances.delete(this._name);
    this._name = name;
    Awdio._instances.set(this._name, this);
    return this;
  }

  get name() {
    return this._name;
  }

  // ==================== 获取选项 ====================

  getOption() {
    return {
      name: this._name,
      src: this._src,
      formula: this._formula,
      type: this._type,
      freq: this._freq,
      duration: this._duration,
      volume: this._volume,
      loop: this._loop,
      poly: this._poly,
      autoplay: this._autoplay,
      autoDestroy: this._autoDestroy,
      muted: this._muted,
      fade: this._fade,
      fadeIn: this._fadeIn,
      fadeOut: this._fadeOut,
      fadeDuration: this._fadeDuration,
      fadeInDuration: this._fadeInDuration,
      fadeOutDuration: this._fadeOutDuration,
      delayMs: this._delayMs,
      device: this._device,
      _isPlaying: this.playing,
      _speed: this._speed,
      speed: this._speed,
      pitch: this._pitch,
      reverse: this._reverse,
      a: this._a,
      r: this._r,
      params: { ...this._params },
      destroyed: this._destroyed
    };
  }

  // ==================== 属性 ====================

  get src() {
    return this._src;
  }

  set src(val) {
    this._src = val;
    this._load();
  }

  get volume() {
    return this._volume;
  }

  set volume(v) {
    this.setVolume(v);
  }

  get currentTime() {
    if (this._activeSources.length > 0) {
      return this._ctx.currentTime - (this._activeSources[0].__startTime || 0);
    }
    return this._pausedAt || 0;
  }

  set currentTime(t) {
    this.seek(t);
  }

  get duration() {
    if (this._formula || this._type) {
      return this._duration;
    }
    return this._buffer ? this._buffer.duration : 0;
  }

  set duration(sec) {
    this._duration = Math.max(0.01, sec);
    if (!this._src && (this._formula || this._type)) {
      this._buffer = this._createBuffer(this._formula || this._type, this._freq);
    }
  }

  get playing() {
    return this._activeSources.length > 0;
  }

  // ==================== 延迟 ====================

  delay(ms) {
    this._delayMs = ms;
    return this;
  }

  // ==================== 倍速 / 音高 / 倒放 ====================

  /**
   * 设置/获取播放倍速
   * @param {number} [rate] - 倍速 0.1~10，不传获取当前值
   */
  speed(rate) {
    if (rate === undefined) return this._speed;
    this._speed = Math.max(0.1, Math.min(10, rate));
    // 更新所有活跃 source 的 playbackRate
    this._activeSources.forEach(s => {
      try { s.playbackRate.value = this._speed * this._pitch; } catch (e) {}
    });
    return this;
  }

  /**
   * 设置/获取音高（通过 playbackRate 实现）
   * @param {number} [rate] - 音高比率 0.1~10，1=原声，2=高八度，0.5=低八度
   */
  pitch(rate) {
    if (rate === undefined) return this._pitch;
    this._pitch = Math.max(0.1, Math.min(10, rate));
    this._activeSources.forEach(s => {
      try { s.playbackRate.value = this._speed * this._pitch; } catch (e) {}
    });
    return this;
  }

  /**
   * 设置/获取倒放
   * @param {boolean} [rev] - 是否倒放，不传获取当前值
   */
  reverse(rev) {
    if (rev === undefined) return this._reverse;
    this._reverse = !!rev;
    this._reversedBuffer = null;
    return this;
  }

  // ==================== 淡入淡出 ====================

  fadeOut(duration) {
    let dur = duration || this._fadeOutDuration || 1;
    let now = this._ctx.currentTime;
    this._gainNode.gain.cancelScheduledValues(now);
    this._gainNode.gain.setValueAtTime(this._gainNode.gain.value, now);
    this._gainNode.gain.linearRampToValueAtTime(0, now + dur);
    setTimeout(() => {
      this.stop();
      this._applyVolume();
    }, dur * 1000 + 100);
    return this;
  }

  // ==================== 实例设备路由 ====================

  /**
   * 设置/获取实例输出设备
   * @param {string|string[]} [deviceId] - 单个设备 ID / 设备 ID 数组 / 不传获取当前设备
   *   单设备：.device('default')  → 仅扬声器
   *   多设备：.device(['id1', 'id2']) → 同时输出到多个设备
   *   无参：  .device() → 获取当前设备配置
   *   null：  .device(null) → 恢复默认
   * @returns {this|string|string[]|null}
   */
  device(deviceId) {
    if (deviceId === undefined) {
      // 获取当前设备
      return this._device;
    }

    if (deviceId === null) {
      // 恢复默认
      this._device = null;
    } else {
      this._device = deviceId;
    }

    this._applyDeviceRouting();
    return this;
  }

  // ==================== 3D 空间音频 ====================

  /**
   * 设置 3D 空间位置
   * @param {object|number} [opts] - 配置对象 / x 坐标 / falsy 表示关闭
   *   opts.x, opts.y, opts.z - 3D 坐标
   * 示例：.spatial({ x: 5, y: 0, z: -10 }) 或 .spatial(5, 0, -10) 或 .spatial() 关闭
   */
  spatial(opts) {
    if (opts === undefined || opts === false || opts === null) {
      if (this._pannerNode) {
        this._pannerNode.disconnect();
        this._pannerNode = null;
        this._rebuildChain();
      }
      return this;
    }

    if (typeof opts === 'number') {
      opts = { x: arguments[0], y: arguments[1] || 0, z: arguments[2] || 0 };
    }

    if (!this._pannerNode) {
      this._pannerNode = this._ctx.createPanner();
      this._pannerNode.panningModel = 'HRTF';
      this._pannerNode.distanceModel = 'inverse';
      this._pannerNode.refDistance = 1;
      this._pannerNode.maxDistance = 10000;
      this._pannerNode.rolloffFactor = 1;
      this._pannerNode.coneInnerAngle = 360;
      this._pannerNode.coneOuterAngle = 0;
      this._pannerNode.coneOuterGain = 0;
      this._rebuildChain();
    }

    if (opts.x != null) this._pannerNode.positionX.value = opts.x;
    if (opts.y != null) this._pannerNode.positionY.value = opts.y;
    if (opts.z != null) this._pannerNode.positionZ.value = opts.z;

    return this;
  }

  // ==================== 音效处理 ====================

  reverb(opts) {
    if (opts === undefined || opts === false || opts === null) {
      if (this._reverbNode) {
        this._reverbDry.disconnect();
        this._reverbWet.disconnect();
        this._reverbNode.disconnect();
        this._reverbNode = null;
        this._reverbDry = null;
        this._reverbWet = null;
        this._rebuildChain();
      }
      return this;
    }

    if (typeof opts === 'number') opts = { mix: opts };

    let room = opts.room != null ? Math.max(0, Math.min(1, opts.room)) : 0.5;
    let damp = opts.damp != null ? Math.max(0, Math.min(1, opts.damp)) : 0.5;
    let mix  = opts.mix  != null ? Math.max(0, Math.min(1, opts.mix))  : 0.5;

    if (!this._reverbNode) {
      this._reverbNode = this._ctx.createConvolver();
      this._reverbNode.buffer = this._createReverbIR(room, damp);
      this._reverbDry = this._ctx.createGain();
      this._reverbDry.gain.value = 1 - mix;
      this._reverbWet = this._ctx.createGain();
      this._reverbWet.gain.value = mix;
      this._rebuildChain();
    } else {
      this._reverbNode.buffer = this._createReverbIR(room, damp);
      this._reverbDry.gain.value = 1 - mix;
      this._reverbWet.gain.value = mix;
    }

    return this;
  }

  _createReverbIR(room, damp) {
    let sr = this._ctx.sampleRate;
    let duration = room * 3 + 0.1;
    let len = Math.floor(sr * duration);
    let buffer = this._ctx.createBuffer(2, len, sr);
    let decayRate = 1 / (room * 2 + 0.2);

    for (let ch = 0; ch < 2; ch++) {
      let data = buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        let t = i / sr;
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * decayRate * (1 - damp * 0.95));
      }
    }
    return buffer;
  }

  comp(opts) {
    if (opts === undefined || opts === false || opts === null) {
      if (this._compNode) {
        this._compNode.disconnect();
        this._compNode = null;
        this._compGainNode.disconnect();
        this._compGainNode = null;
        this._rebuildChain();
      }
      return this;
    }

    if (typeof opts === 'number') opts = { gain: opts };

    let thresh = opts.thresh != null ? opts.thresh : -24;
    let knee   = opts.knee   != null ? opts.knee   : 30;
    let ratio  = opts.ratio  != null ? opts.ratio  : 12;
    let gain   = opts.gain   != null ? Math.max(0, Math.min(1, opts.gain)) : 0.5;

    if (!this._compNode) {
      this._compNode = this._ctx.createDynamicsCompressor();
      this._compGainNode = this._ctx.createGain();
      this._compNode.connect(this._compGainNode);
      this._rebuildChain();
    }

    this._compNode.threshold.value = thresh;
    this._compNode.knee.value = knee;
    this._compNode.ratio.value = ratio;
    this._compGainNode.gain.value = gain;

    return this;
  }

  filter(freq, q) {
    if (freq === undefined || freq === false || freq === null) {
      if (this._filterNode) {
        this._filterNode.disconnect();
        this._filterNode = null;
        this._rebuildChain();
      }
      return this;
    }

    let filterType = 'lowpass';
    let filterFreq = freq;
    let filterQ = 0;

    // 支持 filter({ freq, q, type }) 对象形式
    if (freq && typeof freq === 'object') {
      filterFreq = freq.freq != null ? freq.freq : 1000;
      filterQ = freq.q != null ? Math.max(0.0001, Math.min(1000, freq.q)) : 0;
      filterType = freq.type || 'lowpass';
    } else if (typeof q === 'number') {
      // filter(freq, q) 双参数形式
      filterQ = Math.max(0.0001, Math.min(1000, q));
    }

    if (!this._filterNode) {
      this._filterNode = this._ctx.createBiquadFilter();
      this._rebuildChain();
    }

    this._filterNode.type = filterType;
    this._filterNode.frequency.value = Math.max(20, Math.min(20000, filterFreq));
    this._filterNode.Q.value = filterQ;

    return this;
  }

  /**
   * 高通滤波器便捷方法
   * @param {number} [freq] - 截止频率 Hz / falsy 关闭
   * @param {number} [q] - 共鸣度 Q 值
   */
  hpf(freq, q) {
    if (freq === undefined || freq === false || freq === null) {
      return this.filter();
    }
    if (typeof freq === 'object') {
      freq.type = 'highpass';
      return this.filter(freq);
    }
    return this.filter({ freq, q, type: 'highpass' });
  }

  chorus(opts) {
    if (opts === undefined || opts === false || opts === null) {
      if (this._chorusNode) {
        this._chorusNode.disconnect();
        this._chorusNode = null;
        if (this._chorusLFO) { this._chorusLFO.stop(); this._chorusLFO.disconnect(); this._chorusLFO = null; }
        if (this._chorusDelay) { this._chorusDelay.disconnect(); this._chorusDelay = null; }
        this._rebuildChain();
      }
      return this;
    }

    if (typeof opts === 'number') opts = { perc: opts };

    let perc = opts.perc != null ? Math.max(0, Math.min(1, opts.perc)) : 0.3;
    let lag  = opts.lag  != null ? Math.max(0.001, Math.min(0.1, opts.lag)) : 0.02;

    if (!this._chorusNode) {
      this._chorusDelay = this._ctx.createDelay(0.1);
      this._chorusDelay.delayTime.value = lag;

      this._chorusLFO = this._ctx.createOscillator();
      this._chorusLFO.type = 'sine';
      this._chorusLFO.frequency.value = 0.5;
      this._chorusLFO.start();

      let lfoGain = this._ctx.createGain();
      lfoGain.gain.value = perc * lag * 0.5;
      this._chorusLFO.connect(lfoGain);
      lfoGain.connect(this._chorusDelay.delayTime);

      this._chorusDry = this._ctx.createGain();
      this._chorusDry.gain.value = 0.7;
      this._chorusWet = this._ctx.createGain();
      this._chorusWet.gain.value = 0.3;
      this._chorusNode = this._ctx.createGain();
      this._chorusNode.gain.value = 1;

      this._chorusDry.connect(this._chorusNode);
      this._chorusWet.connect(this._chorusNode);
      this._chorusDelay.connect(this._chorusWet);

      this._rebuildChain();
    } else {
      this._chorusDelay.delayTime.value = lag;
    }

    return this;
  }

  // ==================== 波形塑形（失真）====================

  /**
   * 波形塑形/失真效果
   * @param {object|number} [opts] - 配置对象 / amount值(0-1) / falsy 表示关闭
   *   opts.amount: 失真量 0-1（默认 0.5）
   *   opts.curve:  'soft' | 'hard' | 'fuzz' | 'crunch' | 'fold'（默认 'soft'）
   *
   * 示例：.waveshaper({ amount: 0.7, curve: 'hard' })
   *       .waveshaper(0.5)  // 仅设置 amount，默认 soft
   *       .waveshaper()     // 关闭失真
   */
  waveshaper(opts) {
    if (opts === undefined || opts === false || opts === null) {
      if (this._waveshaperNode) {
        this._waveshaperNode.disconnect();
        this._waveshaperNode = null;
        this._rebuildChain();
      }
      return this;
    }

    if (typeof opts === 'number') opts = { amount: opts };

    let amount = opts.amount != null ? Math.max(0, Math.min(1, opts.amount)) : 0.5;
    let curve = opts.curve || 'soft';

    if (!this._waveshaperNode) {
      this._waveshaperNode = this._ctx.createWaveShaper();
      this._rebuildChain();
    }

    this._waveshaperNode.curve = this._createDistortionCurve(amount, curve);
    this._waveshaperNode.oversample = '2x';

    return this;
  }

  /**
   * 创建失真曲线
   * @param {number} amount - 失真量 0-1
   * @param {string} type - 曲线类型
   * @returns {Float32Array}
   */
  _createDistortionCurve(amount, type) {
    let n = 44100;
    let curve = new Float32Array(n);
    let k = amount * 10;

    for (let i = 0; i < n; i++) {
      let x = (i * 2) / n - 1; // -1 to 1

      switch (type) {
        case 'hard':
          // 硬削波：超过阈值的直接截断
          curve[i] = Math.max(-1 + amount, Math.min(1 - amount, x * (1 + k)));
          break;
        case 'fuzz':
          // 法兹：强烈的非对称失真
          curve[i] = Math.tanh(Math.sin(x * Math.PI * 0.5) * (1 + k * 5)) * (1 - amount * 0.3);
          break;
        case 'crunch':
          // 过载：温和的管状失真
          curve[i] = Math.sign(x) * (1 - Math.exp(-Math.abs(x) * (1 + k * 3)));
          break;
        case 'fold':
          // 波形折叠：超过阈值后反射回来
          curve[i] = Math.abs(x) > 1 - amount * 0.8
            ? Math.sign(x) * (2 * (1 - amount * 0.8) - Math.abs(x))
            : x;
          break;
        case 'soft':
        default:
          // 软削波：tanh 曲线
          curve[i] = Math.tanh(x * (1 + k));
          break;
      }
    }

    return curve;
  }

  // ==================== 移相效果 ====================

  /**
   * 移相效果（Phaser）
   * @param {object|number} [opts] - 配置对象 / rate值(Hz) / falsy 表示关闭
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
  phaser(opts) {
    if (opts === undefined || opts === false || opts === null) {
      if (this._phaserNode) {
        if (this._phaserLFOs) {
          this._phaserLFOs.forEach(l => { try { l.stop(); l.disconnect(); } catch (e) {} });
          this._phaserLFOs = null;
        }
        this._phaserNode.disconnect();
        this._phaserNode = null;
        this._phaserDry.disconnect();
        this._phaserDry = null;
        this._phaserWet.disconnect();
        this._phaserWet = null;
        this._rebuildChain();
      }
      return this;
    }

    if (typeof opts === 'number') opts = { rate: opts };

    let rate   = opts.rate   != null ? Math.max(0.1, Math.min(10, opts.rate))   : 1;
    let depth  = opts.depth  != null ? Math.max(0, Math.min(1, opts.depth))      : 0.5;
    let freq   = opts.freq   != null ? Math.max(20, Math.min(10000, opts.freq))  : 1000;
    let fb     = opts.fb     != null ? Math.max(0, Math.min(1, opts.fb))         : 0.4;
    let stages = opts.stages != null ? Math.max(2, Math.min(12, opts.stages))    : 4;

    if (!this._phaserNode) {
      this._phaserNode = this._ctx.createGain();
      this._phaserNode.gain.value = 1;
      this._phaserDry = this._ctx.createGain();
      this._phaserDry.gain.value = 0.5;
      this._phaserWet = this._ctx.createGain();
      this._phaserWet.gain.value = 0.5;
      this._rebuildChain();
    }

    // 清理旧的 LFO 和 allpass 节点
    if (this._phaserLFOs) {
      this._phaserLFOs.forEach(l => { try { l.stop(); l.disconnect(); } catch (e) {} });
    }
    this._phaserLFOs = [];

    // 重新连接：phaserWet 现在需要重新走 allpass 链
    // 先断开旧的 allpass 链
    // 注意：在 _rebuildChain 中，prev 已连接到 _phaserWet
    // 这里我们需要在 _phaserWet 之前插入 allpass 滤波器链
    // 简单方案：重建整个 phaser 子链

    // 创建 allpass 滤波器链
    let allpassFilters = [];
    let apPrev = this._phaserWet;
    // 断开 _phaserWet 的旧连接
    this._phaserWet.disconnect();

    for (let s = 0; s < stages; s++) {
      let apf = this._ctx.createBiquadFilter();
      apf.type = 'allpass';
      apf.frequency.value = freq;
      apf.Q.value = fb * 5;
      allpassFilters.push(apf);
    }

    // 串联 allpass 链
    for (let s = 0; s < stages; s++) {
      apPrev.connect(allpassFilters[s]);
      apPrev = allpassFilters[s];
    }
    apPrev.connect(this._phaserNode);

    // 创建 LFO 调制每个 allpass 的频率
    for (let s = 0; s < stages; s++) {
      let lfo = this._ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = rate + s * 0.05; // 每阶微调频率
      lfo.start();

      let lfoGain = this._ctx.createGain();
      lfoGain.gain.value = depth * freq * 0.5;
      lfo.connect(lfoGain);
      lfoGain.connect(allpassFilters[s].frequency);

      this._phaserLFOs.push(lfo);
    }

    return this;
  }

  // ==================== 拨弦方法 ====================

  /**
   * 拨弦：使用 Karplus-Strong 算法生成拨弦音并播放
   * @param {number|object} [freq] - 频率 Hz（默认 440）/ 配置对象
   * @param {object} [opts] - 播放选项
   *   opts.duration: 衰减时长 秒（默认 1.5）
   *   opts.decay:    衰减系数 0.9-0.999（默认 0.996）
   *
   * 示例：.pluck(440)  .pluck(220, { duration: 2 })  .pluck({ freq: 330, decay: 0.99 })
   * @returns {this}
   */
  pluck(freq, opts) {
    if (this._destroyed) return this;

    if (freq && typeof freq === 'object') {
      opts = freq;
      freq = opts.freq || 440;
    }
    if (freq === undefined) freq = 440;
    opts = opts || {};

    let duration = opts.duration || 1.5;
    let decay = opts.decay || 0.996;
    let freqVal = Math.max(20, Math.min(8000, freq));

    let buffer = this._createPluckBuffer(freqVal, duration, decay);
    this._buffer = buffer;

    // 停止当前播放并播放新音
    this._stopAllSources();
    this._play();

    return this;
  }

  /**
   * 创建拨弦缓冲区
   * @param {number} freq - 频率
   * @param {number} duration - 时长
   * @param {number} decay - 衰减系数
   */
  _createPluckBuffer(freq, duration, decay) {
    let sr = this._ctx.sampleRate;
    let len = Math.floor(sr * duration);
    let buffer = this._ctx.createBuffer(1, len, sr);
    let data = buffer.getChannelData(0);

    let period = Math.floor(sr / freq);
    if (period < 2) {
      for (let i = 0; i < len; i++) {
        data[i] = Math.sin(2 * Math.PI * freq * i / sr) * Math.exp(-i / sr * 3);
      }
      return buffer;
    }

    let noise = new Float32Array(period);
    for (let i = 0; i < period; i++) {
      noise[i] = (Math.random() * 2 - 1) * 0.5;
    }

    for (let i = 0; i < len; i++) {
      if (i < period) {
        data[i] = noise[i];
      } else {
        data[i] = (data[i - period] + data[i - period + 1]) * 0.5 * decay;
      }
    }

    return buffer;
  }

  // ==================== 包络（ADSR）====================

  /**
   * 设置 ADSR 包络
   * @param {object} [opts] - 配置对象 / falsy 表示关闭
   *   opts.attack:  起音时间 秒（默认 0.01）
   *   opts.decay:   衰减时间 秒（默认 0.1）
   *   opts.sustain: 保持电平 0-1（默认 0.7）
   *   opts.release: 释音时间 秒（默认 0.3）
   *
   * 示例：.envelope({ attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.5 })
   *       .envelope()  // 关闭包络
   */
  envelope(opts) {
    if (opts === undefined || opts === false || opts === null) {
      if (this._envelopeNode) {
        this._envelopeNode.disconnect();
        this._envelopeNode = null;
        this._envelope = null;
        this._rebuildChain();
      }
      return this;
    }

    let attack  = opts.attack  != null ? Math.max(0, opts.attack)  : 0.01;
    let decay   = opts.decay   != null ? Math.max(0, opts.decay)   : 0.1;
    let sustain = opts.sustain != null ? Math.max(0, Math.min(1, opts.sustain)) : 0.7;
    let release = opts.release != null ? Math.max(0, opts.release) : 0.3;

    this._envelope = { attack, decay, sustain, release };

    if (!this._envelopeNode) {
      this._envelopeNode = this._ctx.createGain();
      this._envelopeNode.gain.value = 1;
      this._rebuildChain();
    }

    return this;
  }

  // ==================== 参数 a / r / param ====================

  /**
   * 设置/获取 attack 起音时间（秒）
   * @param {number} [val] - 起音时间，不传获取当前值
   */
  a(val) {
    if (val === undefined) return this._a;
    this._a = Math.max(0, val);
    return this;
  }

  /**
   * 设置/获取 release 释音时间（秒）
   * @param {number} [val] - 释音时间，不传获取当前值
   */
  r(val) {
    if (val === undefined) return this._r;
    this._r = Math.max(0, val);
    return this;
  }

  /**
   * 获取参数对应的 AudioParam 对象（用于调度）
   * 支持：'gain' | 'vol' | 'chainGain' | 'filterFreq' | 'filterQ' | 'pan'
   * @param {string} name - 参数名
   * @returns {AudioParam|null}
   */
  _getAudioParam(name) {
    switch (name) {
      case 'gain':
      case 'vol':
        return this._gainNode.gain;
      case 'chainGain':
        return this._chainInput.gain;
      case 'filterFreq':
        return this._filterNode ? this._filterNode.frequency : null;
      case 'filterQ':
        return this._filterNode ? this._filterNode.Q : null;
      case 'pan': {
        if (!this._stereoPanner) {
          this._stereoPanner = this._ctx.createStereoPanner();
          this._stereoPanner.pan.value = 0;
          this._rebuildChain();
        }
        return this._stereoPanner.pan;
      }
      default:
        return null;
    }
  }

  /**
   * 设置/获取/删除参数（连接真实音频链路）
   *
   * 保留参数名（直接路由到 AudioParam）：
   *   'gain'       → 输出增益 0-1
   *   'vol'        → 输出增益（百分制 0-100，内部转为 0-1）
   *   'chainGain'  → 链输入增益 0-1
   *   'filterFreq' → 滤波器截止频率 Hz
   *   'filterQ'    → 滤波器 Q 值
   *   'pan'        → 立体声平衡 -1~1（自动创建 StereoPanner）
   *   'freq'       → 合成频率 Hz（重新生成 buffer）
   *   'speed'      → 播放倍速 0.1-10
   *
   * 自定义参数名 → 存入 _params 字典（向后兼容）
   *
   * @param {string} key - 参数名
   * @param {*} [val]   - 参数值，不传则获取，传 null 则删除
   * @returns {this|*}
   */
  param(key, val) {
    if (val === undefined) {
      // 获取：优先 AudioParam，其次 _params
      let ap = this._getAudioParam(key);
      if (ap) return ap.value;
      // 特殊处理 freq/speed
      if (key === 'freq') return this._freq;
      if (key === 'speed') return this._speed;
      return this._params[key];
    }

    if (val === null) {
      // 删除
      let ap = this._getAudioParam(key);
      if (ap) {
        ap.value = ap.defaultValue || 0;
      }
      if (key === 'pan' && this._stereoPanner) {
        this._stereoPanner.disconnect();
        this._stereoPanner = null;
        this._rebuildChain();
      }
      delete this._params[key];
      return this;
    }

    // 设置：路由到真实 AudioParam
    let ap = this._getAudioParam(key);
    if (ap) {
      if (key === 'vol') {
        ap.value = Math.max(0, Math.min(100, val)) / 100;
      } else if (key === 'gain') {
        ap.value = Math.max(0, Math.min(1, val));
      } else if (key === 'chainGain') {
        ap.value = Math.max(0, Math.min(1, val));
      } else if (key === 'filterFreq') {
        ap.value = Math.max(20, Math.min(20000, val));
      } else if (key === 'filterQ') {
        ap.value = Math.max(0.0001, Math.min(1000, val));
      } else if (key === 'pan') {
        ap.value = Math.max(-1, Math.min(1, val));
      }
      return this;
    }

    // 特殊处理 freq / speed
    if (key === 'freq') {
      this._freq = Math.max(20, Math.min(20000, val));
      if (!this._src && (this._formula || this._type)) {
        this._buffer = this._createBuffer(this._formula || this._type, this._freq);
      }
      return this;
    }
    if (key === 'speed') {
      this.speed(val);
      return this;
    }

    // 自定义参数 → 字典存储
    this._params[key] = val;
    return this;
  }

  // ==================== 参数自动化调度 ====================

  /**
   * 线性渐变到目标值
   * @param {string} paramName - 参数名 ('gain'|'vol'|'chainGain'|'filterFreq'|'filterQ'|'pan')
   * @param {number} target - 目标值
   * @param {number} duration - 渐变时长（秒）
   * @param {number} [delay] - 延迟开始时间（秒，默认 0）
   *
   * 示例：.ramp('gain', 0, 2)        // 2 秒内增益降到 0
   *       .ramp('filterFreq', 8000, 1.5)  // 1.5 秒内扫频到 8kHz
   *       .ramp('pan', 1, 0.5)       // 0.5 秒内声像移到最右
   *       .ramp('gain', 0.5, 1, 0.5) // 0.5s 后开始，1s 内渐变
   */
  ramp(paramName, target, duration, delay) {
    if (typeof paramName === 'number') {
      // 快捷写法：.ramp(target, duration) → 默认 ramp gain
      delay = duration;
      duration = target;
      target = paramName;
      paramName = 'gain';
    }
    let ap = this._getAudioParam(paramName);
    if (!ap) {
      console.warn('Awdio: ramp() 不支持的参数名:', paramName);
      return this;
    }
    let now = this._ctx.currentTime;
    let startTime = now + (delay || 0);
    let endTime = startTime + duration;

    let clamped = target;
    if (paramName === 'vol') clamped = Math.max(0, Math.min(100, target)) / 100;
    else if (paramName === 'gain' || paramName === 'chainGain') clamped = Math.max(0, Math.min(1, target));
    else if (paramName === 'filterFreq') clamped = Math.max(20, Math.min(20000, target));
    else if (paramName === 'filterQ') clamped = Math.max(0.0001, Math.min(1000, target));
    else if (paramName === 'pan') clamped = Math.max(-1, Math.min(1, target));

    ap.cancelScheduledValues(now);
    ap.setValueAtTime(ap.value, now);
    ap.linearRampToValueAtTime(clamped, endTime);

    return this;
  }

  /**
   * 指数渐变到目标值
   * @param {string} paramName - 参数名
   * @param {number} target - 目标值
   * @param {number} duration - 渐变时长（秒）
   * @param {number} [delay] - 延迟开始时间（秒，默认 0）
   *
   * 示例：.expoRamp('gain', 0.01, 3)  // 3 秒内指数衰减
   */
  expoRamp(paramName, target, duration, delay) {
    if (typeof paramName === 'number') {
      delay = duration;
      duration = target;
      target = paramName;
      paramName = 'gain';
    }
    let ap = this._getAudioParam(paramName);
    if (!ap) {
      console.warn('Awdio: expoRamp() 不支持的参数名:', paramName);
      return this;
    }
    let now = this._ctx.currentTime;
    let startTime = now + (delay || 0);
    let endTime = startTime + duration;

    let clamped = target;
    if (paramName === 'vol') clamped = Math.max(0, Math.min(100, target)) / 100;
    else if (paramName === 'gain' || paramName === 'chainGain') clamped = Math.max(0.0001, Math.min(1, target));
    else if (paramName === 'filterFreq') clamped = Math.max(20, Math.min(20000, target));
    else if (paramName === 'filterQ') clamped = Math.max(0.0001, Math.min(1000, target));
    else if (paramName === 'pan') clamped = Math.max(-1, Math.min(1, target));

    ap.cancelScheduledValues(now);
    ap.setValueAtTime(Math.max(0.0001, ap.value), now);
    ap.exponentialRampToValueAtTime(Math.max(0.0001, clamped), endTime);

    return this;
  }

  /**
   * 在指定时间点设置参数值（不渐变）
   * @param {string} paramName - 参数名
   * @param {number} value - 目标值
   * @param {number} time - 目标时间（秒，相对于 now；默认 0 = 立即）
   *
   * 示例：.setAtTime('gain', 0, 2)  // 2 秒后增益归零
   */
  setAtTime(paramName, value, time) {
    if (typeof paramName === 'number') {
      time = value;
      value = paramName;
      paramName = 'gain';
    }
    let ap = this._getAudioParam(paramName);
    if (!ap) {
      console.warn('Awdio: setAtTime() 不支持的参数名:', paramName);
      return this;
    }
    let now = this._ctx.currentTime;
    let t = now + (time || 0);

    let clamped = value;
    if (paramName === 'vol') clamped = Math.max(0, Math.min(100, value)) / 100;
    else if (paramName === 'gain' || paramName === 'chainGain') clamped = Math.max(0, Math.min(1, value));
    else if (paramName === 'filterFreq') clamped = Math.max(20, Math.min(20000, value));
    else if (paramName === 'filterQ') clamped = Math.max(0.0001, Math.min(1000, value));
    else if (paramName === 'pan') clamped = Math.max(-1, Math.min(1, value));

    ap.setValueAtTime(clamped, t);

    return this;
  }

  /**
   * 取消所有已调度但未执行的参数变化，立即保持当前值
   * @param {string} [paramName] - 参数名，不传则取消所有已知参数
   *
   * 示例：.cancelSched('gain')  // 取消 gain 的调度
   *       .cancelSched()        // 取消所有参数调度
   */
  cancelSched(paramName) {
    let now = this._ctx.currentTime;
    let names = paramName ? [paramName] : ['gain', 'vol', 'chainGain', 'filterFreq', 'filterQ', 'pan'];
    names.forEach(name => {
      let ap = this._getAudioParam(name);
      if (ap) {
        ap.cancelScheduledValues(now);
        ap.setValueAtTime(ap.value, now);
      }
    });
    return this;
  }

  // ==================== clone 方法 ====================

  /**
   * 克隆当前实例（不修改原实例），可选传入变更
   * 支持 .clone()  /  .clone({ volume: 50 })  /  .clone("sine")  /  .clone("https://...")  /  .clone(fn)
   */
  clone(arg) {
    let currentOpts = this.getOption();

    if (arg === undefined) {
      // 无参：纯克隆
    } else if (typeof arg === 'function') {
      currentOpts.formula = arg;
      currentOpts.type = arg;
      currentOpts.src = null;
    } else if (typeof arg === 'string') {
      if (Awdio._isWaveType(arg)) {
        currentOpts.formula = Awdio._formulas.get(arg) || null;
        currentOpts.type = arg;
        currentOpts.src = null;
      } else if (Awdio._isURL(arg) || Awdio._isDataURI(arg)) {
        currentOpts.src = arg;
        currentOpts.formula = null;
        currentOpts.type = null;
      } else {
        currentOpts.src = arg;
        currentOpts.formula = null;
        currentOpts.type = null;
      }
    } else if (arg && typeof arg === 'object') {
      Object.assign(currentOpts, arg);
      // 优先级处理
      if (arg.src !== undefined) { currentOpts.formula = null; currentOpts.type = null; }
      if (arg.formula !== undefined) { currentOpts.src = null; currentOpts.type = arg.formula; }
    }

    delete currentOpts.name;
    currentOpts.destroyed = false;
    currentOpts.delayMs = 0;

    let newInstance = new Awdio(currentOpts);
    this._emit('clone', { instance: newInstance, opts: arg });
    return newInstance;
  }

  // ==================== destroy 方法 ====================

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    this._stopAllSources();
    if (this._releaseTimeoutId) clearTimeout(this._releaseTimeoutId);
    if (this._chorusLFO) { try { this._chorusLFO.stop(); this._chorusLFO.disconnect(); } catch (e) {} }
    if (this._phaserLFOs) {
      this._phaserLFOs.forEach(l => { try { l.stop(); l.disconnect(); } catch (e) {} });
    }
    this._chainInput.disconnect();
    if (this._envelopeNode) this._envelopeNode.disconnect();
    if (this._waveshaperNode) this._waveshaperNode.disconnect();
    if (this._filterNode) this._filterNode.disconnect();
    if (this._compNode) this._compNode.disconnect();
    if (this._compGainNode) this._compGainNode.disconnect();
    if (this._reverbDry) this._reverbDry.disconnect();
    if (this._reverbWet) this._reverbWet.disconnect();
    if (this._reverbNode) this._reverbNode.disconnect();
    if (this._chorusDry) this._chorusDry.disconnect();
    if (this._chorusWet) this._chorusWet.disconnect();
    if (this._chorusDelay) this._chorusDelay.disconnect();
    if (this._chorusNode) this._chorusNode.disconnect();
    if (this._phaserDry) this._phaserDry.disconnect();
    if (this._phaserWet) this._phaserWet.disconnect();
    if (this._phaserNode) this._phaserNode.disconnect();
    if (this._stereoPanner) this._stereoPanner.disconnect();
    if (this._pannerNode) this._pannerNode.disconnect();
    this._gainNode.disconnect();
    this._unbindVisibility();
    Awdio._instances.delete(this._name);

    this._emit('destroy', { name: this._name });
    this._events = {};
  }
}

// ==================== _AwdioManager 内部类 ====================

class _AwdioManager {
  constructor(instances, opts = {}, mode = 'sequential') {
    this._items = instances.filter(i => i instanceof Awdio);
    this._mode = mode;
    this._loop = opts.loop || false;
    this._delay = opts.delay || 0;
    this._fade = opts.fade || false;
    this._fadeIn = opts.fade != null ? !!opts.fade : (opts.fadeIn || false);
    this._fadeOut = opts.fade != null ? !!opts.fade : (opts.fadeOut || false);
    this._fadeDuration = opts.fadeDuration || 1;
    this._fadeInDuration = opts.fadeInDuration || opts.fadeDuration || 1;
    this._fadeOutDuration = opts.fadeOutDuration || opts.fadeDuration || 1;
    this._autoplay = opts.autoplay || false;

    this._currentIndex = -1;
    this._playing = false;
    this._paused = false;
    this._stopped = false;
    this._timeoutId = null;
    this._currentPlaying = null;
    this._events = {};
    this._perItemDelays = []; // 逐项延迟（毫秒），与 _items 一一对应

    // autoplay
    if (this._autoplay && this._items.length > 0) {
      this.play();
    }
  }

  on(event, fn) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(fn);
    return this;
  }

  _emit(event, data) {
    (this._events[event] || []).forEach(fn => {
      try { fn.call(this, data); } catch (e) {}
    });
  }

  play(...indices) {
    if (this._items.length === 0) return this;
    this._stopped = false;
    this._paused = false;

    if (indices.length > 0) {
      indices.forEach(i => {
        if (i >= 0 && i < this._items.length) {
          let item = this._items[i];
          if (this._fadeIn || item._fadeIn) {
            item._fadeIn = true;
            item._fadeInDuration = this._fadeInDuration || item._fadeInDuration;
          }
          item.play();
          this._emit('play', { index: i, instance: item });
        }
      });
    } else {
      if (this._mode === 'parallel') {
        this._playAllParallel();
      } else {
        this._playSequential(0);
      }
    }
    return this;
  }

  pause(...indices) {
    if (indices.length === 0) {
      this._paused = true;
      if (this._timeoutId) {
        clearTimeout(this._timeoutId);
        this._timeoutId = null;
      }
      this._items.forEach(item => {
        if (item.playing) item.pause();
      });
    } else {
      indices.forEach(i => {
        if (i >= 0 && i < this._items.length) {
          this._items[i].pause();
        }
      });
    }
    return this;
  }

  stop() {
    this._stopped = true;
    this._paused = false;
    this._playing = false;
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
    this._items.forEach(item => item.stop());
    this._currentIndex = -1;
    this._currentPlaying = null;
    this._emit('stop');
    return this;
  }

  _playSequential(startIndex) {
    if (this._stopped) return;

    this._playing = true;
    this._currentIndex = startIndex;

    if (this._currentIndex >= this._items.length) {
      this._playing = false;
      if (this._loop) {
        this._playSequential(0);
      } else {
        this._emit('end');
      }
      return;
    }

    let item = this._items[this._currentIndex];
    this._currentPlaying = item;

    let origLoop = item._loop;
    item._loop = false;

    if (this._fadeIn || item._fadeIn) {
      item._fadeIn = true;
      item._fadeInDuration = this._fadeInDuration || item._fadeInDuration;
    }
    if (this._fadeOut || item._fadeOut) {
      item._fadeOut = true;
      item._fadeOutDuration = this._fadeOutDuration || item._fadeOutDuration;
    }

    let onEnd = () => {
      item.off('end', onEnd);
      item._loop = origLoop;
      this._currentPlaying = null;
      let idx = this._currentIndex;
      this._currentIndex++;
      let perDelay = (this._perItemDelays && this._perItemDelays[idx] > 0) ? this._perItemDelays[idx] : this._delay;
      if (perDelay > 0) {
        this._timeoutId = setTimeout(() => {
          this._playSequential(this._currentIndex);
        }, perDelay);
      } else {
        this._playSequential(this._currentIndex);
      }
    };

    item.on('end', onEnd);
    item.play();
    this._emit('play', { index: this._currentIndex, instance: item });
  }

  _playAllParallel() {
    if (this._stopped) return;
    this._playing = true;

    this._items.forEach((item, index) => {
      if (this._fadeIn || item._fadeIn) {
        item._fadeIn = true;
        item._fadeInDuration = this._fadeInDuration || item._fadeInDuration;
      }
      if (this._fadeOut || item._fadeOut) {
        item._fadeOut = true;
        item._fadeOutDuration = this._fadeOutDuration || item._fadeOutDuration;
      }

      item.play();
      this._emit('play', { index, instance: item });

      if (this._loop) {
        let onEnd = () => {
          item.off('end', onEnd);
          item.play();
        };
        item.on('end', onEnd);
      }
    });
  }

  remove(index) {
    if (index < 0 || index >= this._items.length) return this;
    if (this._currentPlaying === this._items[index]) {
      console.warn('Awdio: 不能移除正在播放的音频');
      return this;
    }
    this._items.splice(index, 1);
    return this;
  }

  add(item, position) {
    let instance = Awdio._resolve(item);
    if (!instance) return this;

    if (position === undefined || position >= this._items.length) {
      this._items.push(instance);
    } else {
      this._items.splice(Math.max(0, position), 0, instance);
    }
    return this;
  }

  toggle(a, b) {
    if (a < 0 || a >= this._items.length || b < 0 || b >= this._items.length) return this;
    let temp = this._items[a];
    this._items[a] = this._items[b];
    this._items[b] = temp;
    return this;
  }

  /**
   * 设置/获取队列逐项延迟（毫秒）
   * @param {number} [ms] - 延迟毫秒数，不传获取当前值
   */
  delay(ms) {
    if (ms === undefined) return this._delay;
    this._delay = ms;
    return this;
  }

  get items() {
    return [...this._items];
  }

  get playingAudio() {
    if (this._mode === 'sequential') {
      return this._currentPlaying;
    }
    return this._items.filter(item => item.playing);
  }

  get playing() {
    return this._playing && !this._paused && !this._stopped;
  }
}

  // ==================== 导出 ====================
  return Awdio;

}));

// 别名 Aw
if (typeof window !== 'undefined') { window.Aw = window.Awdio; }