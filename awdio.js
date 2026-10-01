/**
 * Awdio - 轻量级 Web Audio 音频库
 * 支持合成波形、公式自定义声音、3D 空间音频、网络/本地音频、队列播放、链式调用等
 * @version 4.0.0
 */
!(function(root,factory){
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Awdio = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

/**
 * Awdio 与 _AwdioManager 的共享基类
 *
 * 收敛两者逐字/高度重复的部分：事件系统（on/off/_ac）、
 * then 回调（then/_ae/_aj）、循环控制（loop）。
 * 子类只需在构造器里初始化 _events / _thenCallbacks / _thenTimers /
 * _repeat / _repeatCount / _repeatDone。
 */
class _AwdioBase {
  // ==================== 事件 ====================

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

  _ac(event, data = {}) {
    if (!this._events[event]) return;
    this._events[event].forEach(fn => {
      try { fn.call(this, data); } catch (e) { console.error('Awdio event error:', e); }
    });
  }

  // ==================== then 回调 ====================

  /**
   * 注册播放完成回调（播放到末尾/循环结束时触发）
   * @param {Function} fn - 回调函数，接收 this 作为上下文
   * @param {number} [waitTime=0] - 延迟多少毫秒后触发（从 end 时刻起算）
   * @returns {this}
   *
   * 示例：new Awdio('sine').then(() => console.log('播完了'))
   *       Awdio.queue(a, b).then(() => next(), 500)
   */
  then(fn, waitTime = 0) {
    if (typeof fn !== 'function') return this;
    this._thenCallbacks.push({ fn, waitTime: Math.max(0, waitTime || 0) });
    return this;
  }

  /** 触发所有 then 回调（内部使用，'end' 时调用） */
  _ae() {
    if (!this._thenCallbacks || this._thenCallbacks.length === 0) return;
    let list = this._thenCallbacks.slice();
    list.forEach(({ fn, waitTime }) => {
      if (waitTime > 0) {
        let id = setTimeout(() => this._aj(fn), waitTime);
        this._thenTimers.push(id);
      } else {
        this._aj(fn);
      }
    });
  }

  _aj(fn) {
    try { fn.call(this, this); } catch (e) { console.error('Awdio then error:', e); }
  }

  // ==================== loop ====================

  /**
   * 设置/获取循环方式（统一入口，按类型自动判断语义）
   *
   * @param {boolean|number} [val] - 不传则读取当前状态
   *   - true          无限循环
   *   - false         不循环（只播一遍）
   *   - n > 1         重复 n 次（完整播放 n 遍）
   *   - -1 / Infinity 无限循环
   * @returns {this|boolean|number} 传值返回 this；不传时：
   *   - 无限循环 → true
   *   - 不循环   → false
   *   - 有限重复 → 次数（number）
   *
   * 示例：a.loop(true)   // 无限循环
   *       a.loop(3)      // 播放 3 遍
   *       a.loop()       // → true | false | 3
   *
   * 注：如需得知「当前播到第几遍」，监听 'loop' / 'end' 事件的 data.count
   */
  loop(val) {
    if (val === undefined) return Awdio._lv(this._repeat);
    this._repeat = Awdio._as(val);
    this._repeatDone = false;
    this._repeatCount = 0;
    this._bk();
    return this;
  }

  /**
   * 把内部重复次数还原为对外可读值（内部）
   *
   * Infinity → true（无限循环）；1 → false（不循环）；n → n
   */
  static _lv(n) {
    if (n === Infinity) return true;
    if (!n || n <= 1) return false;
    return n;
  }

  /**
   * loop 变更后的同步钩子，子类可覆写
   * （如 HTML5 模式需同步 audio.loop）
   */
  _bk() {}

  /**
   * 初始化淡入淡出配置（Awdio 与 _AwdioManager 共用）
   *
   * 语义：fade 是「统一开关」，显式给出时覆盖 fadeIn / fadeOut；
   *      未给出则分别取 fadeIn / fadeOut。duration 同理，
   *      fadeDuration 作为 fadeInDuration / fadeOutDuration 的兜底。
   *
   * 注：不再单独保存 _fade —— 它是纯写入字段，其信息已由
   *     _fadeIn / _fadeOut 完整表达，单独留存只增冗余。
   */
  _initFade(opts) {
    let unified = opts.fade != null ? !!opts.fade : null;
    this._fadeIn  = unified != null ? unified : !!opts.fadeIn;
    this._fadeOut = unified != null ? unified : !!opts.fadeOut;
    this._fadeDuration    = opts.fadeDuration || 1;
    this._fadeInDuration  = opts.fadeInDuration  || this._fadeDuration;
    this._fadeOutDuration = opts.fadeOutDuration || this._fadeDuration;
  }

  // ==================== 可见性处理 ====================

  /** 页面隐藏时是否应暂停（子类可覆写） */
  _bu() { return false; }
  /** 执行暂停（子类覆写） */
  _bs() {}
  /** 执行恢复（子类覆写） */
  _bt() {}

  /**
   * 绑定 visibilitychange（以及子类附加的 pagehide）
   *
   * 实例与 Manager 共用同一套「隐藏即暂停、回前台自动恢复」骨架，
   * 差异只在判定条件与实际暂停/恢复动作，交由子类钩子实现。
   */
  _h() {
    if (this._bv) return; // 防重复绑定
    this._bv = () => {
      if (document.hidden) {
        if (this._bu()) {
          this._br(true);
          this._bs();
        }
      } else {
        if (this._br() && this._bu()) {
          this._br(false);
          this._bt();
        }
      }
    };
    document.addEventListener('visibilitychange', this._bv);
    this._g();
  }

  _bq() {
    if (this._bv) {
      document.removeEventListener('visibilitychange', this._bv);
      this._bv = null;
    }
    this._bp();
  }

  /** 读写「因隐藏而暂停」标记；传 undefined 为读取，传值则写入 */
  _br(val) {
    if (val === undefined) return this._wasPausedByBackground;
    this._wasPausedByBackground = val;
  }

  /** 子类附加的可见性监听（如实例的 pagehide） */
  _g() {}
  _bp() {}
}

class Awdio extends _AwdioBase {
  // ==================== 静态属性 ====================
  static _counter = 0;
  static _instances = new Map();
  static _globalVolume = 1;
  static _globalMuted = false;
  static _globalGainNode = null;
  static _ctx = null;
  /** 全局输出设备与其设置时间戳（与实例 setOutput 比较先后） */
  static _outputDeviceId = null;
  static _multiOutputNodes = null;
  static _outputAt = 0;

  /** 用户自定义公式 */
  static _formulas = new Map();

  /** 设备断开监听：追踪所有设置了实例级设备的 Awdio 实例 */
  static _deviceChangeInstances = new Set();
  static _deviceChangeSetup = false;

  /** 活跃的 queue/playAll 管理器 */
  static _managers = new Set();

  /** 全局音频缓存：URL → 已解码 AudioBuffer（可用 Awdio.clearCache() 清空） */
  static _audioCache = new Map();
  /** 是否启用全局缓存（默认 true；实例可用 opts.cache:false 单独关闭） */
  static _cacheEnabled = true;

  /**
   * 规范化 loop 取值为「完整播放遍数」（内部状态 _repeat）
   *
   * 内部统一用 _repeat 表示遍数：
   *   true / Infinity / 'inf' / 'forever' 等 → Infinity（无限循环）
   *   负数字（-1 / -2 / -Infinity / '-3' …）→ Infinity（任意负数均视为无限循环）
   *   false / null / undefined              → 1（不循环，只播一遍）
   *   0                                     → Infinity（0 视作无限循环）
   *   n > 1                                 → Math.floor(n)（播 n 遍）
   *   非数字串 / NaN                        → 1
   *
   * @param {*} val - 原始 loop 值
   * @returns {number} 规范化后的遍数（可能为 Infinity）
   */
  static _as(val) {
    if (val === true) return Infinity;
    if (val === false || val === null || val === undefined) return 1;
    if (val === Infinity) return Infinity;
    if (typeof val === 'string') {
      let s = val.trim().toLowerCase();
      if (s === '') return 1;
      if (s === 'true') return Infinity;
      if (s === 'false') return 1;
      if (s === 'inf' || s === 'infinite' || s === 'infinity' || s === 'forever') return Infinity;
      val = Number(s);
      if (isNaN(val)) return 1;
    }
    if (typeof val !== 'number' || isNaN(val)) return 1;
    // 负数（含 -Infinity）一律视为无限循环
    if (val < 0) return Infinity;
    // 0 视作无限循环
    if (val === 0) return Infinity;
    return Math.max(1, Math.floor(val));
  }

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

  /**
   * 选项规格表：getOption / set / param 三处共用的唯一事实来源
   *
   * key   - 选项键名（也是 param() 的键名）
   * def   - 默认值（也是「回读」缺失时的兜底）
   * set   - 写入函数 (inst, val) => void；缺省表示直接写 inst['_' + key]
   * clip  - 写入前的值裁剪函数 (val) => val
   * read  - 读取函数 (inst) => any；缺省读 inst['_' + key]
   * queue - 是否算作 queue/playAll 的队列选项
   * json  - getOption() 导出时是否需要深拷贝
   */
  static _optSpec = [
    { key: 'volume',           def: 1,     clip: v => Awdio._k(v), set: (i, v) => { i._volume = i._at('volume', v); i._e(); } },
    { key: 'loop',             def: false, set: (i, v) => { i.loop(v); },     read: i => Awdio._lv(i._repeat), queue: true },
    { key: 'poly',             def: false, queue: false },
    { key: 'autoplay',         def: false, queue: true },
    { key: 'autoDestroy',      def: false },
    { key: 'muted',            def: false, set: (i, v) => { i.mute(v); } },
    // fade 为派生项：不再单独存储，由 fadeIn / fadeOut 同时为真推出
    { key: 'fade',             def: false, read: i => i._fadeIn && i._fadeOut, queue: true },
    { key: 'fadeIn',           def: false, queue: true },
    { key: 'fadeOut',          def: false, queue: true },
    { key: 'fadeDuration',     def: 1,     queue: true },
    { key: 'fadeInDuration',   def: 1,     queue: true },
    { key: 'fadeOutDuration',  def: 1,     queue: true },
    { key: 'pauseOnBack',      def: false, queue: true },
    { key: 'a',                def: 0.01,  clip: v => Math.max(0, v) },
    { key: 'r',                def: 0.3,   clip: v => Math.max(0, v) },
    { key: 'output',           def: null,  json: true },
    { key: 'clip',             def: null,  json: true },
    { key: 'params',           def: null,  json: true },
    // 只读派生项（仅 getOption 导出，不接受写入）
    { key: 'name',             def: null,  read: i => i._name,   write: false },
    { key: 'src',              def: null,  read: i => i._src,    write: false },
    { key: 'formula',          def: null,  read: i => i._formula, write: false },
    { key: 'type',             def: null,  read: i => i._type,   write: false },
    { key: 'freq',             def: 440,   read: i => i._freq,   write: false },
    { key: 'duration',         def: 2,     read: i => i._duration, write: false },
    { key: 'html',             def: false, read: i => i._useHtmlAudio, write: false },
    { key: 'destroyed',        def: false, read: i => i._destroyed, write: false }
  ];

  /** 队列选项键名（由规格表派生，避免多处维护） */
  static get _queueOptKeys() {
    return Awdio._optSpec.filter(s => s.queue).map(s => s.key);
  }

  /** key → spec 索引（供 _at / _be 快速查找） */
  static get _optByKey() {
    if (!this.__optByKey) {
      let m = Object.create(null);
      for (let s of Awdio._optSpec) m[s.key] = s;
      this.__optByKey = m;
    }
    return this.__optByKey;
  }

  /** 按规格表裁剪取值 */
  _at(key, val) {
    let spec = Awdio._optByKey[key];
    return spec && spec.clip ? spec.clip(val) : val;
  }

  // ==================== 静态方法 ====================

  /**
   * 音量归一化：统一到 0~1
   *
   * 兼容旧版 0~100 写法：传入 >1 的值会按百分制换算（80 → 0.8）
   * 并打印一次性迁移警告，避免静默变成「满音量」。
   */
  static _k(v) {
    let n = Number(v);
    if (!isFinite(n)) return 1;
    if (n > 1) {
      if (!Awdio._volWarned) {
        Awdio._volWarned = true;
        console.warn('Awdio: volume 现已统一为 0~1 刻度（本次收到 ' + n +
          '，已按百分制自动换算）。请改用 0~1 写法，如 volume: 0.8。');
      }
      n = n / 100;
    }
    return Math.max(0, Math.min(1, n));
  }

  static getContext() {
    if (!Awdio._ctx) {
      Awdio._ctx = new (window.AudioContext || window.webkitAudioContext)();
      // 自动播放策略解锁：浏览器要求用户手势后才能 resume
      // 首次创建后自动监听用户手势，自动恢复 AudioContext
      if (typeof document !== 'undefined' && document.addEventListener) {
        let unlock = () => {
          if (Awdio._ctx && Awdio._ctx.state === 'suspended') {
            Awdio._ctx.resume().catch(() => {});
          }
        };
        ['click', 'touchstart', 'touchend'].forEach(evt => {
          document.addEventListener(evt, unlock, { once: true, capture: true });
        });
      }
    }
    return Awdio._ctx;
  }

  /**
   * 手动解锁 AudioContext（自动播放策略）
   * 通常在用户手势（点击/触摸）回调中调用；getContext 已自动注册全局解锁，一般无需手动调用
   * @returns {Awdio}
   */
  static unlock() {
    if (!Awdio._ctx) return Awdio;
    if (Awdio._ctx.state === 'suspended') {
      Awdio._ctx.resume().catch(() => {});
    }
    return Awdio;
  }

  /**
   * 清空全局音频缓存（已解码的 AudioBuffer）
   * @returns {Awdio}
   */
  static clearCache() {
    if (Awdio._audioCache) Awdio._audioCache.clear();
    return Awdio;
  }

  static getGlobalGainNode() {
    if (!Awdio._globalGainNode) {
      Awdio._globalGainNode = Awdio.getContext().createGain();
      Awdio._globalGainNode.gain.value = Awdio._globalVolume;
      Awdio._globalGainNode.connect(Awdio.getContext().destination);
    }
    return Awdio._globalGainNode;
  }

  static setGlobalVolume(vol) {
    Awdio._globalVolume = Math.max(0, Math.min(1, vol));
    Awdio.getGlobalGainNode().gain.value = Awdio._globalVolume;
    Awdio._bj();
  }

  static getGlobalVolume() {
    return Awdio._globalVolume;
  }

  /**
   * 同步所有 HTML5 音频实例的音量（跟随全局 mute/volume）
   */
  static _bj() {
    if (!Awdio._htmlAudioInstances) return;
    Awdio._htmlAudioInstances.forEach(inst => {
      if (inst._destroyed || !inst._htmlAudio) return;
      let individualVol = inst._muted ? 0 : inst._volume;
      let globalScale = Awdio._globalMuted ? 0 : Awdio._globalVolume;
      inst._htmlAudio.volume = individualVol * globalScale;
    });
  }

  /**
   * 全局静音
   * @param {boolean} [val] - true 静音 / false 取消静音 / 不传切换
   */
  static mute(val) {
    if (val === undefined) {
      Awdio._globalMuted = !Awdio._globalMuted;
    } else {
      Awdio._globalMuted = !!val;
    }
    Awdio.getGlobalGainNode().gain.value = Awdio._globalMuted ? 0 : Awdio._globalVolume;
    Awdio._bj();
  }

  /**
   * 停止所有实例及队列（淡出后停止）
   */
  static stopAll() {
    Awdio._instances.forEach(inst => {
      if (inst.playing) {
        inst.fadeOut(0.15);
      } else {
        inst.stop();
      }
    });
    Awdio._managers.forEach(mgr => mgr.stop());
    Awdio._managers.clear();
  }

  /**
   * 暂停/恢复所有实例及队列
   * @param {boolean} [val] - true 暂停（默认）/ false 恢复
   */
  static pauseAll(val) {
    if (val === undefined) val = true;
    if (val) {
      Awdio._instances.forEach(inst => {
        if (inst.playing) {
          inst._wasPausedByGlobal = true;
          inst._av();
        }
      });
      Awdio._managers.forEach(mgr => {
        mgr._wasPausedByGlobal = true;
        mgr.pause();
      });
    } else {
      Awdio._instances.forEach(inst => {
        if (inst._wasPausedByGlobal) {
          inst._wasPausedByGlobal = false;
          inst._aw();
        }
      });
      Awdio._managers.forEach(mgr => {
        if (mgr._wasPausedByGlobal) {
          mgr._wasPausedByGlobal = false;
          mgr.play();
        }
      });
    }
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
    // 记录设置时间戳：实例 .setOutput() 若更晚调用则覆盖本次全局设置
    Awdio._bm();
    // 通知所有实例按时间戳重新决定路由
    Awdio._ba();

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

  /** 更新全局输出设备的时间戳（内部，用于与实例设置比较先后） */
  static _bm() {
    Awdio._outputAt = Date.now();
    return Awdio._outputAt;
  }

  /**
   * 全局输出变更后，让所有实例按时间戳重新决定谁生效
   * （内部使用）
   */
  static _ba() {
    Awdio._instances.forEach(inst => {
      if (inst._destroyed || !inst._output) return;
      if (inst._useHtmlAudio && inst._htmlAudio) inst._c();
      else inst._d();
    });
  }

  /** 定义自定义声音公式
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

  static _am(str) {
    return /^(https?:)?\/\//.test(str);
  }

  static _ak(str) {
    return /^data:/.test(str);
  }

  /**
   * 判断是否应使用 HTML5 AudioElement 播放
   * @param {string|null} src - 音频源
   * @param {boolean} [explicitHtml] - 显式 html 选项；data URI 始终强制 WebAudio
   */
  static _x(src, explicitHtml) {
    if (Awdio._ak(src)) return false;
    if (explicitHtml !== undefined) return !!explicitHtml;
    return !!(Awdio._am(src) && !Awdio._ak(src));
  }

  static _an(str) {
    return Awdio._waveTypes.includes(str) || Awdio._formulas.has(str);
  }

  static _au(time) {
    if (typeof time === 'number') return Math.max(0, time);
    if (typeof time === 'string') {
      let parts = time.split(':').map(Number);
      if (parts.length === 1) return Math.max(0, parts[0]);
      if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
      if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
    }
    return 0;
  }

  /**
   * 创建实例并加载本地音频文件
   * @param {File|Blob|ArrayBuffer|ArrayBufferView|string} file - 本地音频文件对象 / ArrayBuffer / 音频 URL 或路径
   * @param {object} [opts] - 实例选项（如 { autoplay: true, volume: 0.8 }）
   * @returns {Awdio} 新的 Awdio 实例
   *
   * 示例：let a = Awdio.load(fileInput.files[0], { autoplay: true })
   *       let b = Awdio.load('music.mp3').play()
   */
  static load(file, opts) {
    let inst = new Awdio(opts || {});
    return inst.load(file);
  }

  static _bc(item) {
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
   * 统一解析 queue/playAll 参数
   * 支持数组形式 [a, 200, b, opts] 与扁平形式 (a, 200, b, opts)
   * 数字跟在 item 后表示该 item 的逐项延迟，叠加到全局 delay
   * @returns {{ entries: Array<{item: Awdio|null, delayAfter: number}>, opts: object }}
   */
  static _j(args) {
    // 末尾对象若含以下任一键，视为队列选项而非单个音频实例选项
    let QUEUE_OPT_KEYS = Awdio._queueOptKeys.concat(['delay', 'then', 'waitTime']);
    let opts = {};
    let raw;

    if (Array.isArray(args[0])) {
      raw = args[0];
      if (args[1] && typeof args[1] === 'object' && !Array.isArray(args[1])) {
        opts = args[1];
      }
    } else {
      raw = [...args];
      // 末尾是选项对象则提取（仅当含队列选项键，避免误吞实例选项对象）
      let last = raw[raw.length - 1];
      if (last && typeof last === 'object' && !Array.isArray(last) && !(last instanceof Awdio) && typeof last !== 'function') {
        let hasQueueOpts = QUEUE_OPT_KEYS.some(k => k in last);
        if (hasQueueOpts) {
          opts = raw.pop();
        }
      }
    }

    let globalDelay = opts.delay || 0;
    let entries = [];
    let pendingDelay = 0;

    for (let val of raw) {
      if (typeof val === 'number') {
        pendingDelay += val;
      } else {
        let inst = Awdio._bc(val);
        if (inst) {
          entries.push({ item: inst, delayAfter: pendingDelay + globalDelay });
          pendingDelay = 0;
        }
      }
    }
    // 剩余数字作为末尾延迟
    if (pendingDelay > 0) {
      entries.push({ item: null, delayAfter: pendingDelay + globalDelay });
    }

    return { entries, opts };
  }

  static queue(...args) {
    let { entries, opts } = Awdio._j(args);
    let mgr = new _AwdioManager(entries.filter(e => e.item).map(e => e.item), opts, 'sequential');
    Awdio._managers.add(mgr);
    mgr._perItemDelays = entries.map(e => e.delayAfter);
    return mgr;
  }

  static playAll(...args) {
    let { entries, opts } = Awdio._j(args);
    let mgr = new _AwdioManager(entries.filter(e => e.item).map(e => e.item), opts, 'parallel');
    Awdio._managers.add(mgr);
    mgr._perItemDelays = entries.map(e => e.delayAfter);
    return mgr;
  }

  // ==================== 构造函数 ====================

  constructor(arg1, arg2) {
    super();
    this._ctx = Awdio.getContext();

    // ---- 音效链：source -> _chainInput -> [_envelopeNode] -> [filter] -> [comp] -> [reverb] -> [chorus] -> [panner] -> _gainNode -> globalGain -> dest ----
    this._chainInput = this._ctx.createGain();
    this._chainInput.gain.value = 1;

    this._envelopeNode = null;        // ADSR 包络节点（可选）
    this._envelope = null;            // ADSR 配置

    this._gainNode = this._ctx.createGain();
    this._gainNode.gain.value = 1;

    this._output = null;           // 实例级输出设备（null | string | string[]）
    this._deviceOutputs = null;    // 设备输出节点列表
    this._deviceChangeHandler = null; // 设备断开自动降级监听
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
    this._phaserFilters = null;   // 移相 allpass 链（rebuild 时重建）
    this._stereoPanner = null;
    this._pannerNode = null;
    this._analyserNode = null;     // FFT 频谱分析
    this._freqData = null;         // 频域数据缓存
    this._timeData = null;         // 时域数据缓存

    // 解析参数：支持函数作为 formula
    let opts = {};
    if (typeof arg1 === 'function') {
      opts = { type: arg1 };
    } else if (typeof arg1 === 'string') {
      if (Awdio._am(arg1)) {
        opts = { src: arg1 };
      } else if (Awdio._an(arg1)) {
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
    this._volume = opts.volume != null ? Awdio._k(opts.volume) : 1;
    this._repeat = Awdio._as(opts.loop);
    this._repeatCount = 0;      // 已播放完成的次数（不含正在播放的这一遍）
    this._repeatDone = false;   // 是否已播完指定次数
    this._thenCallbacks = [];   // .then(fn, waitMs) 回调列表
    this._thenTimers = [];      // then 回调的定时器（销毁时清理）
    this._poly = opts.poly || false;
    this._autoplay = opts.autoplay || false;
    this._autoDestroy = opts.autoDestroy || false; // 播放完毕后自动销毁
    this._muted = opts.muted || false;
    this._initFade(opts);
    this._speed = opts.speed != null ? Math.max(0.1, Math.min(10, opts.speed)) : 1;
    this._pitch = opts.pitch != null ? Math.max(0.1, Math.min(10, opts.pitch)) : 1;
    this._reverse = opts.reverse || false;
    this._pauseOnBack = opts.pauseOnBack !== undefined ? opts.pauseOnBack : true;
    this._cache = opts.cache !== undefined ? !!opts.cache : true; // 是否参与全局音频缓存
    // HTML5 Audio 判断：合成音波强制 false；其余按 _x（data URI 强制 false，网络 URL 默认 true）
    let _isSynth = !!(this._formula || this._type);
    this._useHtmlAudio = _isSynth ? false : Awdio._x(this._src, opts.html);
    this._htmlAudio = null;
    this._objectUrl = null;       // load(file) 创建的 object URL（销毁时回收）
    this._playRequested = false;  // 音频加载完成前调用 play() 的挂起标记
    this._loadToken = 0;          // 加载令牌：连续 load 时只认最新一次
    this._detune = opts.detune || 0; // 微调音高（音分 cents）
    this._fadeOutTimer = null;    // 淡出定时器（防止与 play() 竞态）
    this._fadeOutInterval = null; // HTML5 淡出 interval
    // 延迟效果器节点
    this._delayNode = null;       // DelayNode
    this._delayDry = null;        // 干声增益
    this._delayWet = null;        // 湿声增益
    this._delayMix = null;        // 干湿混合节点（串联进链）
    this._delayFeedback = null;   // 反馈增益
    this._delayFilter = null;     // 反馈低通（可选）
    this._a = opts.a != null ? Math.max(0, opts.a) : 0.01;
    this._r = opts.r != null ? Math.max(0, opts.r) : 0.3;
    this._params = {}; // 通用参数存储
    this._clip = opts.clip || null; // 音频片段映射 { name: [startMs, endMs] }
    this._clipActive = null;  // 当前激活的片段 [offsetSec, durationSec]
    this._clipSlice = opts._clipSlice || null; // clip() 创建的临时片段 [offsetSec, durationSec]

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
    this._wasPausedByGlobal = false;
    this._isLoading = false;
    this._releasing = false;
    this._releaseTimeoutId = null;
    this._reversedBuffer = null;
    this._htmlClipTimer = null; // HTML5 clip 超时定时器

    // 实例级输出设备
    if (opts.output) {
      this.setOutput(opts.output);
    }

    // 应用音量
    this._e();

    // 初始化立体声平衡（opts.pan，-1~1）
    if (opts.pan != null) {
      this.param('pan', opts.pan);
    }

    // 加载或合成：src > formula > type
    if (this._src) {
      if (this._useHtmlAudio) {
        this._t();
        if (this._autoplay) this._aw();
      } else {
        this._aq();
      }
    } else if (this._formula) {
      this._buffer = this._p(this._formula, this._freq);
      if (this._autoplay) this._aw();
    } else if (this._type) {
      this._buffer = this._p(this._type, this._freq);
      if (this._autoplay) this._aw();
    }

    this._h();
  }

  // ==================== 音效链 ====================

  _bb() {
    this._chainInput.disconnect();
    if (this._envelopeNode) this._envelopeNode.disconnect();
    if (this._waveshaperNode) this._waveshaperNode.disconnect();
    if (this._filterNode) this._filterNode.disconnect();
    if (this._compNode) this._compNode.disconnect();
    if (this._compGainNode) this._compGainNode.disconnect();
    if (this._delayNode) this._delayNode.disconnect();
    if (this._delayDry) this._delayDry.disconnect();
    if (this._delayWet) this._delayWet.disconnect();
    if (this._delayMix) this._delayMix.disconnect();
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
    if (this._analyserNode) this._analyserNode.disconnect();
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

    // 延迟效果（干湿混合后继续串联给后续效果）
    if (prev && this._delayNode && this._delayDry && this._delayWet && this._delayMix) {
      prev.connect(this._delayDry);
      prev.connect(this._delayNode);
      // 重建内部反馈环与湿声链（rebuild 会断开所有连接）
      this._delayNode.connect(this._delayFeedback);
      this._delayFeedback.connect(this._delayNode);
      if (this._delayFilter) {
        this._delayNode.connect(this._delayFilter);
        this._delayFilter.connect(this._delayWet);
      } else {
        this._delayNode.connect(this._delayWet);
      }
      this._delayDry.connect(this._delayMix);
      this._delayWet.connect(this._delayMix);
      prev = this._delayMix;
    }

    // 移相效果：重建 allpass 链（rebuild 会断开 phaserWet 的输出）
    if (prev && this._phaserNode && this._phaserDry && this._phaserWet && this._phaserFilters && this._phaserFilters.length > 0) {
      prev.connect(this._phaserDry);
      prev.connect(this._phaserWet);
      let apPrev = this._phaserWet;
      for (let apf of this._phaserFilters) {
        apPrev.connect(apf);
        apPrev = apf;
      }
      apPrev.connect(this._phaserNode);
      this._phaserDry.connect(this._phaserNode);
      prev = this._phaserNode;
    } else if (prev && this._phaserNode && this._phaserDry && this._phaserWet) {
      prev.connect(this._phaserDry);
      prev.connect(this._phaserWet);
      this._phaserDry.connect(this._phaserNode);
      this._phaserWet.connect(this._phaserNode);
      prev = this._phaserNode;
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

    // FFT 频谱分析（位于效果链末端，捕获完整处理后的信号）
    if (prev && this._analyserNode) {
      prev.connect(this._analyserNode);
      this._analyserNode.connect(this._gainNode);
      prev = null;
    }

    if (prev) {
      prev.connect(this._gainNode);
    }

    this._d();
  }

  /**
   * 将 _gainNode 路由到正确的输出（全局 || 实例级设备）
   */
  async _d() {
    let ctx = this._ctx;
    // 并发守卫：await 期间可能被新的 setOutput/全局变更打断，
    // 旧调用据此提前退出，避免写入已被清空的 _deviceOutputs
    let token = this._outputToken = (this._outputToken || 0) + 1;

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

    // 仅当播放中时才重新连接到全局输出（否则由 _ad 在播放时连接）
    let wasConnected = this._chainConnected;
    if (wasConnected) {
      this._gainNode.connect(Awdio.getGlobalGainNode());
    }

    // 全局设置若比实例更晚，则本次实例输出让位（跟随全局）
    if (!this._output || this._outputAt < Awdio._outputAt) {
      if (!wasConnected) this._gainNode.disconnect();
      this._chainConnected = false;
      this._ad();
      return;
    }

    let ids = Array.isArray(this._output) ? this._output : [this._output];
    let toDefault = ids.includes('default');
    let outputs = [];
    this._deviceOutputs = outputs;
    // 含 'default' 时同时保留全局输出
    if (toDefault) {
      this._gainNode.connect(Awdio.getGlobalGainNode());
      this._chainConnected = true;
    }

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

      // 期间被新的调用取代：清理本次已建的节点，避免泄漏
      if (this._outputToken !== token) {
        try { audioEl.pause(); audioEl.srcObject = null; audioEl.remove(); } catch (e) {}
        try { destNode.disconnect(); } catch (e) {}
        return;
      }
      if (this._deviceOutputs !== outputs) return;
      outputs.push({ destNode, audioEl });
    }
  }

  /**
   * 确保增益链已连接到全局输出（按需连接，避免闲置节点泄漏）
   */
  _ad() {
    if (!this._chainConnected) {
      this._gainNode.connect(Awdio.getGlobalGainNode());
      this._chainConnected = true;
    }
  }

  /**
   * 断开增益链与全局输出的连接（释放 AudioContext 节点资源）
   * 保留 _gainNode 本身及其内部效果链，仅断开到全局输出的连线
   */
  _y() {
    if (this._chainConnected && this._activeSources.length === 0) {
      this._gainNode.disconnect(Awdio.getGlobalGainNode());
      this._chainConnected = false;
    }
  }

  // ==================== HTML5 Audio 回退 ====================

  /**
   * 创建 HTML5 AudioElement 用于替代 Web Audio API 播放
   * 解决 CORS 跨域问题，当网络音频无法通过 fetch 获取时使用
   */
  _t() {
    if (this._htmlAudio) return;
    this._htmlAudio = document.createElement('audio');
    this._htmlAudio.src = this._src;
    this._htmlAudio.loop = this._repeat === Infinity;
    this._htmlAudio.playbackRate = this._speed * this._pitch;
    this._htmlAudio.volume = this._muted ? 0 : this._volume;

    // 设备路由
    if (this._output) {
      this._c();
    }

    let onPlay = () => this._ac('play');
    let onPause = () => { this._ac('pause'); };
    let onEnded = () => {
      // 有限 loop：未播满则自动重播（原生 loop 已处理无限循环）
      if (this._repeat !== Infinity && !this._repeatDone && this._repeatCount + 1 < this._repeat) {
        this._repeatCount++;
        this._ac('loop', { count: this._repeatCount, total: this._repeat });
        try {
          this._htmlAudio.currentTime = 0;
          this._htmlAudio.play().catch(() => {});
        } catch (e) {}
        return;
      }
      this._repeatDone = true;
      this._ac('end', { count: this._repeatCount + 1, total: this._repeat, repeated: this._repeat > 1 });
      this._ae();
      if (this._repeat !== Infinity && this._autoDestroy) this.destroy();
    };
    let onError = (e) => {
      console.warn('Awdio: HTML5 音频加载失败，尝试回退到 Web Audio API', this._src);
      this._ac('error', { error: e, src: this._src });
      // CORS 错误时尝试回退到 Web Audio API
      this._useHtmlAudio = false;
      this._htmlAudio.remove();
      this._htmlAudio = null;
      this._aq();
    };
    let onTimeUpdate = () => {
      this._ac('progress', {
        loaded: this._htmlAudio.currentTime,
        total: this._htmlAudio.duration || 0,
        percent: this._htmlAudio.duration ? Math.round(this._htmlAudio.currentTime / this._htmlAudio.duration * 100) : 0
      });
    };
    let onLoaded = () => {
      this._ac('load', { src: this._src });
    };

    this._htmlAudio.addEventListener('play', onPlay);
    this._htmlAudio.addEventListener('pause', onPause);
    this._htmlAudio.addEventListener('ended', onEnded);
    this._htmlAudio.addEventListener('error', onError);
    this._htmlAudio.addEventListener('timeupdate', onTimeUpdate);
    this._htmlAudio.addEventListener('loadedmetadata', onLoaded);

    // 存储引用以便清理
    this._htmlAudioListeners = { onPlay, onPause, onEnded, onError, onTimeUpdate, onLoaded };

    // 注册到全局 HTML5 实例列表，用于全局 mute/volume 同步
    if (!Awdio._htmlAudioInstances) Awdio._htmlAudioInstances = new Set();
    Awdio._htmlAudioInstances.add(this);
  }

  /**
   * 将 HTML5 Audio 输出到指定设备
   */
  _c() {
    if (!this._htmlAudio || !this._output) return;
    let ids = Array.isArray(this._output) ? this._output : [this._output];
    // 多设备：创建额外 audio 元素，走 MediaStream 方案
    if (ids.length > 1) {
      this._d(); // 回退到 Web Audio 多设备方案
      return;
    }
    let id = ids[0];
    if (id === 'default') return;
    if (this._htmlAudio.setSinkId) {
      this._htmlAudio.setSinkId(id).catch(e => {
        console.warn('Awdio: HTML5 setSinkId 失败:', id, e);
      });
    }
  }

  // ==================== 可见性处理 ====================

  _bu() { return this.playing && this._pauseOnBack; }
  _bs() { this._wasPlayingBeforeHidden = true; this._av(); }

  _br(val) {
    if (val === undefined) return this._wasPlayingBeforeHidden;
    this._wasPlayingBeforeHidden = val;
  }

  _bt() { this._aw(); }

  _g() {
    this._bw = () => {
      if (this.playing && this._pauseOnBack) {
        this._wasPlayingBeforeHidden = true;
        this._av();
      }
    };
    window.addEventListener('pagehide', this._bw);
  }

  _bp() {
    if (this._bw) {
      window.removeEventListener('pagehide', this._bw);
      this._bw = null;
    }
  }

  // ==================== 设备断开自动降级 ====================

  /**
   * 全局设备变化监听（单例，所有实例共享）
   */
  static _bf() {
    if (Awdio._deviceChangeSetup) return;
    Awdio._deviceChangeSetup = true;

    navigator.mediaDevices.addEventListener('devicechange', async () => {
      // 获取当前可用输出设备列表
      let available = [];
      try {
        let devices = await navigator.mediaDevices.enumerateDevices();
        available = devices.filter(d => d.kind === 'audiooutput').map(d => d.deviceId);
      } catch (e) {
        return; // 无法枚举，不处理
      }

      // 遍历所有注册了实例级设备的实例
      for (let inst of Awdio._deviceChangeInstances) {
        if (inst._destroyed || !inst._output) continue;

        let ids = Array.isArray(inst._output) ? inst._output : [inst._output];
        let allPresent = ids.every(id => id === 'default' || available.includes(id));

        if (!allPresent) {
          console.warn('Awdio: 输出设备已断开，自动降回扬声器。原设备:', inst._output);
          inst._output = null;
          inst._d();
          inst._ac('deviceLost', { prevDevice: ids });
        }
      }
    });
  }

  /**
   * 注册设备断开监听
   */
  _f() {
    if (!this._output || this._deviceChangeHandler) return;
    Awdio._bf();
    Awdio._deviceChangeInstances.add(this);
    this._deviceChangeHandler = true;
  }

  /**
   * 注销设备断开监听
   */
  _bn() {
    if (this._deviceChangeHandler) {
      Awdio._deviceChangeInstances.delete(this);
      this._deviceChangeHandler = null;
    }
  }

  // ==================== loop 控制 ====================

  /** loop 变更后同步到 HTML5 audio 元素 */
  _bk() {
    if (this._htmlAudio) this._htmlAudio.loop = this._repeat === Infinity;
  }

  // ==================== 加载音频 ====================

  /**
   * 加载本地音频文件（File / Blob / ArrayBuffer / URL 字符串）
   * @param {File|Blob|ArrayBuffer|ArrayBufferView|string} file - 本地音频文件对象、二进制数据或音频 URL/路径
   * @param {object} [opts] - 可选：{ autoplay: true } 加载完成后自动播放
   * @returns {this}
   *
   * 示例：awdio.load(fileInput.files[0])           // 加载本地文件
   *       awdio.load(file, { autoplay: true })     // 加载并播放
   *       Awdio.load(file).play()                  // 静态方式创建并加载
   */
  load(file, opts) {
    if (this._destroyed || !file) return this;
    if (opts && typeof opts === 'object') {
      if (opts.autoplay !== undefined) this._autoplay = !!opts.autoplay;
    }

    // 清理旧源（object URL / HTML5 Audio / buffer）
    this._m();

    if (typeof file === 'string') {
      // URL / 路径 / data URI
      this._formula = null;
      this._type = null;
      this._src = file;
      this._useHtmlAudio = Awdio._x(file);
      if (this._useHtmlAudio) {
        this._t();
      } else {
        this._aq();
      }
      return this;
    }

    if (file instanceof Blob || (typeof File !== 'undefined' && file instanceof File)) {
      // File/Blob → object URL → fetch 解码
      this._formula = null;
      this._type = null;
      this._src = URL.createObjectURL(file);
      this._objectUrl = this._src;
      this._useHtmlAudio = false;
      this._aq();
      return this;
    }

    // ArrayBuffer / TypedArray / DataView → 直接解码
    let buf = file.buffer ? file.buffer : file;
    if (buf instanceof ArrayBuffer) {
      this._formula = null;
      this._type = null;
      this._src = null;
      this._isLoading = true;
      let token = ++this._loadToken;
      this._ctx.decodeAudioData(buf.slice(0)).then(decoded => {
        if (token !== this._loadToken) return;
        this._buffer = decoded;
        this._isLoading = false;
        this._ac('load', { src: null });
        if (this._playRequested || this._autoplay) {
          this._playRequested = false;
          this._aw();
        }
      }).catch(e => {
        if (token !== this._loadToken) return;
        this._isLoading = false;
        console.error('Awdio: 解码音频失败', e);
        this._ac('error', { error: e, src: null });
      });
      return this;
    }

    console.warn('Awdio: load() 不支持的参数类型', file);
    return this;
  }

  /**
   * 清理当前音频源的所有资源（切源前调用）
   * 回收 object URL、销毁 HTML5 Audio、清空解码 buffer 与暂停位置
   */
  _m() {
    if (this._objectUrl) {
      try { URL.revokeObjectURL(this._objectUrl); } catch (e) {}
      this._objectUrl = null;
    }
    if (this._htmlAudio) {
      this._htmlAudio.pause();
      this._htmlAudio.src = '';
      this._htmlAudio.remove();
      this._htmlAudio = null;
      if (Awdio._htmlAudioInstances) Awdio._htmlAudioInstances.delete(this);
    }
    this._buffer = null;
    this._pausedAt = 0;
    this._playRequested = false;
  }

  async _aq() {
    // 令牌机制：连续 load() 时只认最新一次（旧请求结果作废）
    let token = ++this._loadToken;
    this._isLoading = true;

    // 全局音频缓存命中（blob: URL 不缓存，避免 object URL 泄漏）
    let useCache = Awdio._cacheEnabled && this._cache !== false && !this._objectUrl;
    if (useCache && this._src && Awdio._audioCache.has(this._src)) {
      this._buffer = Awdio._audioCache.get(this._src);
      this._isLoading = false;
      this._ac('load', { src: this._src, cached: true });
      this._b(token);
      return;
    }

    try {
      let buf;
      if (Awdio._ak(this._src)) {
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
        // 流式读取 + 进度回调（旧浏览器无 ReadableStream 时降级 arrayBuffer）
        let contentLength = resp.headers.get('content-length');
        let total = contentLength ? parseInt(contentLength, 10) : 0;
        let chunks = [];
        let loaded = 0;
        if (resp.body && resp.body.getReader) {
          let reader = resp.body.getReader();
          while (true) {
            let { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            if (total > 0) {
              this._ac('progress', { loaded, total, percent: Math.round(loaded / total * 100) });
            }
          }
        } else {
          let arr = await resp.arrayBuffer();
          loaded = arr.byteLength;
          chunks.push(new Uint8Array(arr));
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

      // 已被更新的 load() 取代：丢弃本次结果
      if (token !== this._loadToken) return;

      let decoded = await this._ctx.decodeAudioData(buf);
      // decode 期间又发起了新 load：丢弃
      if (token !== this._loadToken) return;

      this._buffer = decoded;
      if (useCache && this._src && !this._objectUrl) {
        Awdio._audioCache.set(this._src, decoded);
      }
      this._isLoading = false;
      this._ac('load', { src: this._src, cached: false });
      this._b(token);
    } catch (e) {
      if (token !== this._loadToken) return;
      this._isLoading = false;
      console.error('Awdio: 加载音频失败', e);
      this._ac('error', { error: e, src: this._src });
    }
  }

  /**
   * 加载完成后的收尾：触发挂起的 play() / autoplay
   */
  _b(token) {
    if (token !== this._loadToken) return;
    if (this._playRequested || this._autoplay) {
      this._playRequested = false;
      this._aw();
    }
  }

  // ==================== 合成音频 ====================

  /**
   * 统一入口：根据 type 创建缓冲区
   * 支持函数（公式）、注册的公式名、内置波形类型
   */
  _p(type, freq, duration) {
    if (duration === undefined) duration = this._duration || 2;
    // 1. 函数类型 → 直接作为公式
    if (typeof type === 'function') {
      return this._s(type, freq, duration);
    }
    // 2. 注册的公式名
    if (Awdio._formulas.has(type)) {
      return this._s(Awdio._formulas.get(type), freq, duration);
    }
    // 3. 内置波形类型
    return this._w(type, freq, duration);
  }

  /**
   * 公式缓冲区：逐采样点调用 fn(t, freq, sr, opts)
   */
  _s(fn, freq, duration) {
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

  _w(type, freq, duration = 2) {
    let sr = this._ctx.sampleRate;
    let len = Math.floor(sr * duration);
    let buffer = this._ctx.createBuffer(1, len, sr);
    let data = buffer.getChannelData(0);

    // Karplus-Strong 类型
    if (type === 'guitar' || type === 'pluck' || type === 'harp' || type === 'marimba' || type === 'vibraphone') {
      let decayMap = { guitar: 0.996, pluck: 0.99, harp: 0.997, marimba: 0.998, vibraphone: 0.999 };
      let decay = decayMap[type] || 0.99;
      let ksData = this._ap(freq, sr, duration, decay);
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

  _ap(freq, sr, duration, decay) {
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

  _ag() {
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

  _aw() {
    if (this._destroyed) return;

    // 取消未完成的淡出，避免淡出定时器随后 stop() 杀掉本次播放
    if (this._fadeOutTimer) {
      clearTimeout(this._fadeOutTimer);
      this._fadeOutTimer = null;
    }
    if (this._fadeOutInterval) {
      clearInterval(this._fadeOutInterval);
      this._fadeOutInterval = null;
    }
    // 取消淡出增益调度，恢复实际音量
    if (this._gainNode) {
      try {
        this._gainNode.gain.cancelScheduledValues(this._ctx.currentTime);
      } catch (e) {}
    }

    // HTML5 音频模式
    if (this._useHtmlAudio) {
      if (!this._htmlAudio) this._t();
      // clip 片段处理
      let clipOffset = null, clipDuration = null;
      if (this._clipActive) {
        clipOffset = this._clipActive[0];
        clipDuration = this._clipActive[1];
        this._clipActive = null;
      } else if (this._clipSlice) {
        clipOffset = this._clipSlice[0];
        clipDuration = this._clipSlice[1];
      }
      if (this._pausedAt != null) {
        this._htmlAudio.currentTime = clipOffset != null ? clipOffset + this._pausedAt : this._pausedAt;
        this._pausedAt = null;
      } else if (clipOffset != null) {
        this._htmlAudio.currentTime = clipOffset;
      }
      // 同步 loop 状态
      this._htmlAudio.loop = this._repeat === Infinity;
      this._htmlAudio.playbackRate = this._speed * this._pitch;
      this._htmlAudio.play().catch(e => {
        console.warn('Awdio: HTML5 音频播放失败', e);
        this._ac('error', { error: e, src: this._src });
      });
      // clip 时长限制：到时间自动停止
      if (clipDuration != null && this._repeat !== Infinity) {
        if (this._htmlClipTimer) clearTimeout(this._htmlClipTimer);
        this._htmlClipTimer = setTimeout(() => {
          if (this._htmlAudio) {
            this._htmlAudio.pause();
            this._repeatDone = true;
            this._ac('end', { count: this._repeatCount + 1, total: this._repeat });
            this._ae();
            if (this._autoDestroy) this.destroy();
          }
        }, clipDuration * 1000);
      }
      return;
    }

    if (!this._buffer) {
      // 正在加载或有 src 但未就绪：挂起播放请求，加载完成后自动播放
      if (this._isLoading || (this._src && !this._buffer)) {
        this._playRequested = true;
        return;
      }
      console.warn('Awdio: 音频尚未就绪');
      return;
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }

    // 按需连接增益链到全局输出（防止闲置节点泄漏）
    this._ad();

    if (!this._poly) {
      this._bg();
    }

    let source = this._ctx.createBufferSource();
    source.buffer = this._reverse ? this._ag() : this._buffer;
    source.loop = this._repeat === Infinity;
    source.playbackRate.value = this._speed * this._pitch;
    if (source.detune) source.detune.value = this._detune;
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
        this._muted ? 0 : this._volume,
        now + this._fadeInDuration
      );
    }

    let offset = this._pausedAt != null ? this._pausedAt : 0;
    let duration;
    // clip 片段播放：覆盖 offset 和 duration
    if (this._clipActive) {
      offset = this._clipActive[0];
      duration = this._clipActive[1];
      this._clipActive = null;
    } else if (this._clipSlice) {
      offset = this._clipSlice[0];
      duration = this._clipSlice[1];
    }
    if (duration != null) {
      source.start(0, offset, duration);
      source.__startTime = this._ctx.currentTime - offset;
    } else {
      source.start(0, offset);
      source.__startTime = this._ctx.currentTime - offset;
    }

    this._activeSources.push(source);
    this._pausedAt = null;

    this._ac('play', { source });

    let onEnd = () => {
      let idx = this._activeSources.indexOf(source);
      if (idx !== -1) this._activeSources.splice(idx, 1);
      try { source.disconnect(); } catch (e) {}
      if (this._activeSources.length === 0) {
          // 有限 loop：未播满指定次数则自动重播一遍
          this._repeatCount++;
          if (this._repeat !== Infinity && !this._repeatDone && this._repeatCount < this._repeat) {
            this._ac('loop', { count: this._repeatCount, total: this._repeat });
            this._aw();
            return;
          }
          this._repeatDone = true;
          let looped = this._repeat !== Infinity && this._repeat > 1;
          this._ac('end', { count: this._repeatCount, total: this._repeat, repeated: looped });
          this._ae();
          // 非循环非多音模式：播放完毕断开全局输出，释放音频图资源
          if (this._repeat !== Infinity && !this._poly) {
            this._y();
            // autoDestroy：播放完毕自动销毁实例，彻底释放所有节点
            if (this._autoDestroy) {
              this.destroy();
              return;
            }
          }
        }
    };

    // 有限次重复也需要结束回调；无限循环由 source.loop 自行反复，无需回调
    if (this._repeat !== Infinity) {
      source.onended = onEnd;
    }
  }

  _av() {
    // HTML5 音频模式
    if (this._useHtmlAudio && this._htmlAudio) {
      this._htmlAudio.pause();
      return;
    }

    // 淡出暂停
    if (this._fadeOut && this._activeSources.length > 0) {
      let now = this._ctx.currentTime;
      this._gainNode.gain.cancelScheduledValues(now);
      this._gainNode.gain.setValueAtTime(this._gainNode.gain.value, now);
      this._gainNode.gain.linearRampToValueAtTime(0, now + this._fadeOutDuration);
      let srcs = [...this._activeSources];
      setTimeout(() => {
        this._aa(srcs);
        this._e();
      }, this._fadeOutDuration * 1000 + 50);
      return;
    }
    this._z();
  }

  _aa(srcs) {
    if (this._activeSources.length > 0) {
      this._pausedAt = this._ctx.currentTime - (srcs[0].__startTime || 0);
    }
    srcs.forEach(s => {
      try { s.onended = null; s.stop(); s.disconnect(); } catch (e) {}
    });
    this._activeSources = this._activeSources.filter(s => !srcs.includes(s));
  }

  _z() {
    if (this._activeSources.length > 0) {
      this._pausedAt = this._ctx.currentTime - (this._activeSources[0].__startTime || 0);
    }
    this._activeSources.forEach(s => {
      try { s.onended = null; s.stop(); s.disconnect(); } catch (e) {}
    });
    this._activeSources = [];
  }

  _bg() {
    // HTML5 音频模式
    if (this._useHtmlAudio && this._htmlAudio) {
      this._htmlAudio.pause();
      this._htmlAudio.currentTime = 0;
      return;
    }

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
        this._ab();
      }, this._envelope.release * 1000 + 50);
      return;
    }
    this._ab();
  }

  _ab() {
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
      // clip 名称优先：play('laser') → 设置 _clipActive
      if (typeof arg === 'string' && this._clip && this._clip[arg]) {
        let [startMs, endMs] = this._clip[arg];
        this._clipActive = [startMs / 1000, (endMs - startMs) / 1000];
      } else {
        this._ah(arg);
      }
    }

    // 新的播放请求：重置重复计数
    // （内部 loop 重播直接调用 _aw()，不经过此处，计数得以保留）
    if (this._repeatDone || this._repeatCount > 0) {
      this._repeatDone = false;
      this._repeatCount = 0;
    }

    if (this._delayMs > 0) {
      let delay = this._delayMs;
      this._delayMs = 0;
      setTimeout(() => this._aw(), delay);
      return this;
    }

    this._aw();
    return this;
  }

  pause(arg) {
    if (this._destroyed) return this;

    if (arg !== undefined) {
      this._ah(arg);
    }

    this._av();
    this._ac('pause');
    return this;
  }

  stop(arg) {
    if (this._destroyed) return this;

    if (arg !== undefined) {
      this._ah(arg);
    }

    this._playRequested = false;
    if (this._fadeOutTimer) { clearTimeout(this._fadeOutTimer); this._fadeOutTimer = null; }
    if (this._fadeOutInterval) { clearInterval(this._fadeOutInterval); this._fadeOutInterval = null; }
    this._bg();
    this._pausedAt = 0;
    this._repeatCount = 0;
    this._repeatDone = false;
    this._ac('stop');
    // 停止后断开全局输出，释放音频图资源
    this._y();
    return this;
  }

  seek(time) {
    let seconds = Awdio._au(time);
    // HTML5 音频模式
    if (this._useHtmlAudio && this._htmlAudio) {
      this._htmlAudio.currentTime = Math.max(0, seconds);
      return this;
    }
    if (this._activeSources.length > 0) {
      let wasRepeat = this._repeat;
      let wasDone = this._repeatDone;
      this._repeat = 1;             // 防止 seek 期间误触重播
      this._repeatDone = true;
      this._bg();
      this._pausedAt = seconds;
      this._aw();
      this._repeat = wasRepeat;
      this._repeatDone = wasDone;
    } else {
      this._pausedAt = Math.max(0, seconds);
    }
    return this;
  }

  // ==================== 选项设置 ====================

  /**
   * 设置选项（setOptions 已简化为 set）
   * 支持：.set({ volume: 0.5, loop: true })
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
      this._buffer = this._p(arg, this._freq);
      return this;
    }

    if (typeof arg === 'string') {
      this._ah(arg);
      return this;
    }

    if (arg && typeof arg === 'object') {
      // 优先级：src > formula > type（同时存在时按此优先级选取）
      let hasSrc = arg.src !== undefined;
      let hasFormula = arg.formula !== undefined;
      let hasType = arg.type !== undefined;

      if (hasSrc) {
        // src 最高优先级：清除 formula / type / 旧源
        this._m();
        this._src = arg.src;
        this._formula = null;
        this._type = null;
        this._useHtmlAudio = Awdio._x(this._src, arg.html);
        if (this._useHtmlAudio) {
          this._t();
        } else {
          this._aq();
        }
      } else if (hasFormula) {
        // formula 第二优先级
        this._m();
        this._formula = arg.formula;
        this._type = arg.formula;
        this._src = null;
        this._useHtmlAudio = false;
        this._buffer = this._p(arg.formula, this._freq);
      } else if (hasType) {
        // type 第三优先级
        this._m();
        this._type = arg.type;
        this._src = null;
        this._useHtmlAudio = false;
        if (typeof arg.type === 'function') {
          this._formula = arg.type;
          this._buffer = this._p(arg.type, this._freq);
        } else if (Awdio._formulas.has(arg.type)) {
          this._formula = Awdio._formulas.get(arg.type);
          this._buffer = this._p(arg.type, this._freq);
        } else {
          this._formula = null;
          this._buffer = this._p(arg.type, this._freq);
        }
      }
      if (arg.loop !== undefined) this.loop(arg.loop);
      // 其余选项统一走规格表（fade 组联动在 _be 内处理）
      let touchedVolume = false;
      for (let key in arg) {
        if (key === 'loop') continue;
        if (key === 'src' || key === 'formula' || key === 'type') continue;
        if (arg[key] === undefined) continue;
        if (key === 'volume') touchedVolume = true;
        this._be(key, arg[key]);
      }
      if (touchedVolume || arg.muted !== undefined) this._e();
    }

    return this;
  }

  /**
   * 处理参数：函数 / 字符串 / 对象
   */
  _ah(arg) {
    if (typeof arg === 'function') {
      this._m();
      this._formula = arg;
      this._type = arg;
      this._src = null;
      this._useHtmlAudio = false;
      this._buffer = this._p(arg, this._freq);
    } else if (typeof arg === 'string') {
      if (Awdio._an(arg)) {
        this._m();
        this._type = arg;
        this._formula = Awdio._formulas.get(arg) || null;
        this._useHtmlAudio = false;
        this._buffer = this._p(arg, this._freq);
      } else if (Awdio._am(arg) || Awdio._ak(arg)) {
        this._m();
        this._src = arg;
        this._formula = null;
        this._type = null;
        this._useHtmlAudio = Awdio._x(arg);
        if (this._useHtmlAudio) {
          this._t();
        } else {
          this._aq();
        }
      } else {
        this._m();
        this._src = arg;
        this._formula = null;
        this._type = null;
        this._useHtmlAudio = false;
        this._aq();
      }
    } else if (arg && typeof arg === 'object') {
      this.set(arg);
    }
  }

  setVolume(vol) {
    this._volume = Awdio._k(vol);
    this._e();
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
    this._e();
    this._ac('mute', { muted: this._muted });
    return this;
  }

  _e() {
    this._gainNode.gain.value = this._muted ? 0 : this._volume;
    if (this._useHtmlAudio && this._htmlAudio) {
      let individualVol = this._muted ? 0 : this._volume;
      let globalScale = Awdio._globalMuted ? 0 : Awdio._globalVolume;
      this._htmlAudio.volume = individualVol * globalScale;
    }
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
    let out = {};
    for (let spec of Awdio._optSpec) {
      let k = spec.key;
      let v;
      if (k === 'params') {
        v = { ...this._params };
      } else if (k === 'clip') {
        v = this._clip ? { ...this._clip } : null;
      } else {
        v = spec.read ? spec.read(this) : this['_' + k];
      }
      out[k] = v;
    }
    // 派生/兼容项
    out._isPlaying = this.playing;
    out._speed = this._speed;
    out.speed = this._speed;
    out.pitch = this._pitch;
    out.detune = this._detune;
    out.reverse = this._reverse;
    out.delayMs = this._delayMs;
    out.output = this._output;
    return out;
  }

  /**
   * 按规格表写入单个选项（set / param / 构造器共用）
   * @returns {boolean} 是否命中了已知规格项
   */
  _be(key, val) {
    let spec = Awdio._optByKey[key];
    // 特殊写入：key 有专属语义
    if (key === 'freq') {
      this._freq = Math.max(20, Math.min(20000, val));
      if (!this._src && (this._formula || this._type)) {
        this._buffer = this._p(this._formula || this._type, this._freq);
      }
      return true;
    }
    if (key === 'speed') { this.speed(val); return true; }
    if (key === 'pitch') { this.pitch(val); return true; }
    if (key === 'reverse') { this.reverse(val); return true; }
    if (key === 'output') { this.setOutput(val); return true; }
    if (key === 'fade') {
      // fade 组联动：fade 同时控制淡入与淡出
      this._fadeIn = this._fadeOut = !!val;
      return true;
    }
    if (key === 'fadeDuration') {
      this._fadeDuration = val;
      this._fadeInDuration = this._fadeOutDuration = val;
      return true;
    }
    if (key === 'html') {
      // 音波音乐强制忽略；其他情况尊重显式设置（data URI 同样强制 WebAudio）
      if (this._formula || this._type) {
        this._useHtmlAudio = false;
      } else {
        this._useHtmlAudio = Awdio._x(this._src, val);
      }
      if (this._useHtmlAudio && this._src && !this._htmlAudio) {
        this._t();
      }
      if (!this._useHtmlAudio && this._htmlAudio) {
        this._htmlAudio.remove();
        this._htmlAudio = null;
        if (this._src) this._aq();
      }
      return true;
    }
    if (key === 'duration') {
      this._duration = Math.max(0.01, val);
      if (!this._src && (this._formula || this._type)) {
        this._buffer = this._p(this._formula || this._type, this._freq);
      }
      return true;
    }
    if (!spec || spec.write === false) return false;
    if (spec.set) { spec.set(this, val); return true; }
    this['_' + key] = spec.clip ? spec.clip(val) : val;
    return true;
  }

  // ==================== 属性 ====================

  get src() {
    return this._src;
  }

  set src(val) {
    this._src = val;
    this._useHtmlAudio = Awdio._x(val);
    if (this._useHtmlAudio) {
      if (this._htmlAudio) { this._htmlAudio.remove(); this._htmlAudio = null; }
      this._t();
    } else {
      this._aq();
    }
  }

  get volume() {
    return this._volume;
  }

  set volume(v) {
    this.setVolume(v);
  }

  get currentTime() {
    if (this._useHtmlAudio && this._htmlAudio) {
      return this._htmlAudio.currentTime;
    }
    if (this._activeSources.length > 0) {
      return this._ctx.currentTime - (this._activeSources[0].__startTime || 0);
    }
    return this._pausedAt || 0;
  }

  set currentTime(t) {
    this.seek(t);
  }

  get duration() {
    if (this._useHtmlAudio && this._htmlAudio) {
      return this._htmlAudio.duration || 0;
    }
    if (this._formula || this._type) {
      return this._duration;
    }
    return this._buffer ? this._buffer.duration : 0;
  }

  set duration(sec) {
    this._duration = Math.max(0.01, sec);
    if (!this._src && (this._formula || this._type)) {
      this._buffer = this._p(this._formula || this._type, this._freq);
    }
  }

  get playing() {
    if (this._useHtmlAudio && this._htmlAudio) {
      return !this._htmlAudio.paused;
    }
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
    if (this._useHtmlAudio && this._htmlAudio) {
      this._htmlAudio.playbackRate = this._speed * this._pitch;
    }
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
    if (this._useHtmlAudio && this._htmlAudio) {
      this._htmlAudio.playbackRate = this._speed * this._pitch;
    }
    return this;
  }

  /**
   * 设置/获取微调音高（音分 cents，±100 = 一个半音）
   * 仅 Web Audio 模式生效（HTML5 模式不支持 detune）
   * @param {number} [cents] - 音分值（如 +50 升半音，-50 降半音），不传获取当前值
   */
  detune(cents) {
    if (cents === undefined) return this._detune;
    this._detune = Math.max(-1200, Math.min(1200, cents));
    this._activeSources.forEach(s => {
      try { s.detune.value = this._detune; } catch (e) {}
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
    // HTML5 音频模式：用 volume 线性降低模拟
    if (this._useHtmlAudio && this._htmlAudio) {
      let steps = 20;
      let stepMs = dur * 1000 / steps;
      let startVol = this._htmlAudio.volume;
      let step = 0;
      if (this._fadeOutInterval) clearInterval(this._fadeOutInterval);
      this._fadeOutInterval = setInterval(() => {
        step++;
        this._htmlAudio.volume = Math.max(0, startVol * (1 - step / steps));
        if (step >= steps) {
          clearInterval(this._fadeOutInterval);
          this._fadeOutInterval = null;
          this.stop();
          this._e();
        }
      }, stepMs);
      return this;
    }
    let now = this._ctx.currentTime;
    this._gainNode.gain.cancelScheduledValues(now);
    this._gainNode.gain.setValueAtTime(this._gainNode.gain.value, now);
    this._gainNode.gain.linearRampToValueAtTime(0, now + dur);
    if (this._fadeOutTimer) clearTimeout(this._fadeOutTimer);
    this._fadeOutTimer = setTimeout(() => {
      this._fadeOutTimer = null;
      this.stop();
      this._e();
    }, dur * 1000 + 100);
    return this;
  }

  // ==================== 实例设备路由 ====================

  /**
   * 设置/获取实例输出设备
   *
   * 与 Awdio.setGlobalOutput() 按「调用时间」决定谁生效：
   * 实例设置比全局更晚 → 本实例走自己的设备；全局更晚 → 跟随全局（含后续新的全局设置）。
   *
   * @param {string|string[]} [id] - 设备 ID / 设备 ID 数组 / 不传获取当前设置
   *   单设备：.setOutput('default')      → 仅扬声器
   *   多设备：.setOutput(['id1', 'id2']) → 同时输出到多个设备
   *   无参：  .setOutput()               → 获取当前设置
   *   null：  .setOutput(null)           → 恢复默认（跟随全局）
   * @returns {this|string|string[]|null}
   *
   * 示例：awdio.setOutput('abc123')
   *       Awdio.setGlobalOutput('xyz')   // 更晚调用 → 覆盖上面这行
   */
  setOutput(id) {
    if (id === undefined) return this._output;

    if (id === null) {
      this._bn();
      this._output = null;
    } else {
      this._bn();
      this._output = id;
      this._f();
    }
    // 记录实例设置时间戳，用于与全局设置比较先后
    this._outputAt = Awdio._bm();

    // HTML5 模式：直接设置 audio 元素 sink
    if (this._useHtmlAudio && this._htmlAudio) {
      this._c();
    } else {
      this._d();
    }
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
        this._bb();
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
      this._bb();
    }

    if (opts.x != null) this._pannerNode.positionX.value = opts.x;
    if (opts.y != null) this._pannerNode.positionY.value = opts.y;
    if (opts.z != null) this._pannerNode.positionZ.value = opts.z;

    return this;
  }

  /**
   * 立体声平衡（StereoPanner）
   * @param {number} [val] - -1（最左）~ 1（最右），0 = 居中；不传获取当前值
   * @returns {this|number}
   *
   * 示例：.pan(-0.5)     // 声像偏左
   *       .pan(1)        // 声像到最右
   *       .pan()         // 获取当前声像
   *       .pan(0)        // 恢复居中
   */
  pan(val) {
    if (val === undefined) {
      return this._stereoPanner ? this._stereoPanner.pan.value : 0;
    }
    this.param('pan', val);
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
        this._bb();
      }
      return this;
    }

    if (typeof opts === 'number') opts = { mix: opts };

    let room = opts.room != null ? Math.max(0, Math.min(1, opts.room)) : 0.5;
    let damp = opts.damp != null ? Math.max(0, Math.min(1, opts.damp)) : 0.5;
    // wet 为 wad 兼容别名，与 mix 等价
    let mix  = opts.mix  != null ? Math.max(0, Math.min(1, opts.mix))
            : opts.wet != null ? Math.max(0, Math.min(1, opts.wet))
            : 0.5;

    if (!this._reverbNode) {
      this._reverbNode = this._ctx.createConvolver();
      this._reverbDry = this._ctx.createGain();
      this._reverbDry.gain.value = 1 - mix;
      this._reverbWet = this._ctx.createGain();
      this._reverbWet.gain.value = mix;
      this._bb();
    } else {
      this._reverbDry.gain.value = 1 - mix;
      this._reverbWet.gain.value = mix;
    }

    if (opts.impulse != null) {
      // 外部脉冲响应文件（URL / ArrayBuffer / Blob / File）：异步加载，就绪后自动生效
      this._ar(opts.impulse);
    } else {
      // 无 impulse 时使用自生成噪声 IR（离线可用，不依赖外部资源）
      this._reverbNode.buffer = this._v(room, damp);
    }

    return this;
  }

  /**
   * 加载混响脉冲响应（impulse response）
   * @param {string|ArrayBuffer|Blob|File} input - impulse 文件 URL / 二进制数据
   * 加载完成后自动设置到 ConvolverNode，并触发 'load'（type='reverb-impulse'）事件
   */
  _ar(input) {
    if (this._destroyed) return;
    let ctx = this._ctx;
    let promise;

    if (typeof input === 'string') {
      promise = fetch(input).then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      });
    } else if (input instanceof ArrayBuffer || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(input) && input.buffer instanceof ArrayBuffer)) {
      promise = Promise.resolve(input.buffer ? input.buffer : input);
    } else if (input instanceof Blob) {
      promise = input.arrayBuffer();
    } else {
      console.warn('Awdio: reverb impulse 参数类型不支持', input);
      return;
    }

    promise
      .then(buf => ctx.decodeAudioData(buf.slice(0)))
      .then(decoded => {
        if (this._destroyed || !this._reverbNode) return;
        this._reverbNode.buffer = decoded;
        this._ac('load', { type: 'reverb-impulse', src: typeof input === 'string' ? input : null });
      })
      .catch(e => {
        console.error('Awdio: 加载混响 impulse 失败', e);
        this._ac('error', { error: e, type: 'reverb-impulse' });
      });
  }

  _v(room, damp) {
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
        this._bb();
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
      this._bb();
    }

    this._compNode.threshold.value = thresh;
    this._compNode.knee.value = knee;
    this._compNode.ratio.value = ratio;
    this._compGainNode.gain.value = gain;

    return this;
  }

  /**
   * 延迟效果（Echo / Delay）
   * @param {object|number} [opts] - 配置对象 / time值(秒) / falsy 表示关闭
   *   opts.time:      延迟时间 秒（默认 0.3）
   *   opts.feedback:  反馈量 0-0.95（默认 0.4），越大回声越多
   *   opts.mix:       干湿比 0-1（默认 0.4）
   *   opts.filterFreq: 反馈低通截止频率 Hz（可选，默认不滤波）
   *
   * 示例：.delay({ time: 0.35, feedback: 0.5, mix: 0.4 })
   *       .delay(0.5)      // 仅设置延迟时间
   *       .delay()         // 关闭延迟
   *       .delay({ time: 0.3, feedback: 0.3, mix: 0.3, filterFreq: 3000 })
   */
  delay(opts) {
    if (opts === undefined || opts === false || opts === null) {
      if (this._delayNode) {
        this._delayNode.disconnect(); this._delayNode = null;
        this._delayDry.disconnect(); this._delayDry = null;
        this._delayWet.disconnect(); this._delayWet = null;
        this._delayMix.disconnect(); this._delayMix = null;
        this._delayFeedback.disconnect(); this._delayFeedback = null;
        if (this._delayFilter) { this._delayFilter.disconnect(); this._delayFilter = null; }
        this._bb();
      }
      return this;
    }

    if (typeof opts === 'number') opts = { time: opts };

    let time       = opts.time       != null ? Math.max(0.001, Math.min(5, opts.time)) : 0.3;
    let feedback   = opts.feedback   != null ? Math.max(0, Math.min(0.95, opts.feedback)) : 0.4;
    let mix        = opts.mix        != null ? Math.max(0, Math.min(1, opts.mix)) : 0.4;
    let filterFreq = opts.filterFreq != null ? Math.max(20, Math.min(20000, opts.filterFreq)) : null;

    if (!this._delayNode) {
      this._delayNode = this._ctx.createDelay(5);
      this._delayNode.delayTime.value = time;

      this._delayDry = this._ctx.createGain();
      this._delayDry.gain.value = 1 - mix;
      this._delayWet = this._ctx.createGain();
      this._delayWet.gain.value = mix;
      this._delayMix = this._ctx.createGain();
      this._delayMix.gain.value = 1;

      // 反馈环：delayNode → feedback → delayNode
      this._delayFeedback = this._ctx.createGain();
      this._delayFeedback.gain.value = feedback;
      this._delayNode.connect(this._delayFeedback);
      this._delayFeedback.connect(this._delayNode);

      if (filterFreq != null) {
        this._delayFilter = this._ctx.createBiquadFilter();
        this._delayFilter.type = 'lowpass';
        this._delayFilter.frequency.value = filterFreq;
        this._delayNode.connect(this._delayFilter);
        this._delayFilter.connect(this._delayWet);
      } else {
        this._delayNode.connect(this._delayWet);
      }

      this._bb();
    } else {
      this._delayNode.delayTime.value = time;
      this._delayFeedback.gain.value = feedback;
      this._delayDry.gain.value = 1 - mix;
      this._delayWet.gain.value = mix;
      if (filterFreq != null && this._delayFilter) this._delayFilter.frequency.value = filterFreq;
    }

    return this;
  }

  filter(freq, q) {
    if (freq === undefined || freq === false || freq === null) {
      if (this._filterNode) {
        this._filterNode.disconnect();
        this._filterNode = null;
        this._bb();
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
      this._bb();
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
        this._bb();
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

      this._bb();
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
        this._bb();
      }
      return this;
    }

    if (typeof opts === 'number') opts = { amount: opts };

    let amount = opts.amount != null ? Math.max(0, Math.min(1, opts.amount)) : 0.5;
    let curve = opts.curve || 'soft';

    if (!this._waveshaperNode) {
      this._waveshaperNode = this._ctx.createWaveShaper();
      this._bb();
    }

    this._waveshaperNode.curve = this._q(amount, curve);
    this._waveshaperNode.oversample = '2x';

    return this;
  }

  /**
   * 创建失真曲线
   * @param {number} amount - 失真量 0-1
   * @param {string} type - 曲线类型
   * @returns {Float32Array}
   */
  _q(amount, type) {
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
        this._phaserFilters = null;
        this._phaserNode.disconnect();
        this._phaserNode = null;
        this._phaserDry.disconnect();
        this._phaserDry = null;
        this._phaserWet.disconnect();
        this._phaserWet = null;
        this._bb();
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
      this._bb();
    }

    // 清理旧的 LFO 和 allpass 节点
    if (this._phaserLFOs) {
      this._phaserLFOs.forEach(l => { try { l.stop(); l.disconnect(); } catch (e) {} });
    }
    this._phaserLFOs = [];

    // 重新连接：phaserWet 现在需要重新走 allpass 链
    // 先断开旧的 allpass 链
    // 注意：在 _bb 中，prev 已连接到 _phaserWet
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
    this._phaserFilters = allpassFilters;

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

    let buffer = this._u(freqVal, duration, decay);
    this._buffer = buffer;

    // 拨弦必须走 Web Audio 合成链：若实例处于 HTML5 模式，切换到 WebAudio
    if (this._useHtmlAudio) {
      this._useHtmlAudio = false;
      if (this._htmlAudio) {
        this._htmlAudio.pause();
        this._htmlAudio.remove();
        this._htmlAudio = null;
        if (Awdio._htmlAudioInstances) Awdio._htmlAudioInstances.delete(this);
      }
    }

    // 停止当前播放并播放新音
    this._bg();
    this._aw();

    return this;
  }

  /**
   * 创建拨弦缓冲区
   * @param {number} freq - 频率
   * @param {number} duration - 时长
   * @param {number} decay - 衰减系数
   */
  _u(freq, duration, decay) {
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
        this._bb();
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
      this._bb();
    }

    return this;
  }

  // ==================== FFT 频谱分析 ====================

  /**
   * 启用/配置/关闭频谱分析器
   * @param {object|number|boolean} [opts] - 配置对象 / fftSize / falsy 关闭
   *   opts.fftSize: 32~32768 的 2 的幂（默认 2048）
   *   opts.smoothing: 时间平滑系数 0~1（默认 0.8）
   *   opts.minDecibels: 最小分贝值（默认 -100）
   *   opts.maxDecibels: 最大分贝值（默认 -30）
   *
   * 示例：.analyser()                          // 默认配置启用
   *       .analyser({ fftSize: 512, smoothing: 0.5 })
   *       .analyser(1024)                      // 仅设置 fftSize
   *       .analyser(false)                     // 关闭
   */
  analyser(opts) {
    if (opts === false || opts === null) {
      if (this._analyserNode) {
        this._analyserNode.disconnect();
        this._analyserNode = null;
        this._freqData = null;
        this._timeData = null;
        this._bb();
      }
      return this;
    }

    if (typeof opts === 'number') {
      opts = { fftSize: opts };
    }
    if (!opts) opts = {};

    let fftSize = opts.fftSize || 2048;
    let smoothing = opts.smoothing != null ? opts.smoothing : 0.8;
    let minDecibels = opts.minDecibels != null ? opts.minDecibels : -100;
    let maxDecibels = opts.maxDecibels != null ? opts.maxDecibels : -30;

    if (!this._analyserNode) {
      this._analyserNode = this._ctx.createAnalyser();
      this._bb();
    }

    this._analyserNode.fftSize = fftSize;
    this._analyserNode.smoothingTimeConstant = smoothing;
    this._analyserNode.minDecibels = minDecibels;
    this._analyserNode.maxDecibels = maxDecibels;

    // 预分配数据缓存
    let binCount = this._analyserNode.frequencyBinCount;
    this._freqData = new Uint8Array(binCount);
    this._timeData = new Uint8Array(fftSize);

    return this;
  }

  /**
   * 获取频域数据（频谱）
   * @param {object} [opts]
   *   opts.normalized: 是否归一化到 0~1（默认 false，返回 0~255）
   * @returns {Uint8Array|Float32Array} 频域数据，长度 = fftSize/2
   */
  freqData(opts) {
    if (!this._analyserNode) return null;
    let normalized = opts && opts.normalized;

    if (!this._freqData || this._freqData.length !== this._analyserNode.frequencyBinCount) {
      this._freqData = new Uint8Array(this._analyserNode.frequencyBinCount);
    }

    this._analyserNode.getByteFrequencyData(this._freqData);

    if (normalized) {
      let result = new Float32Array(this._freqData.length);
      for (let i = 0; i < this._freqData.length; i++) {
        result[i] = this._freqData[i] / 255;
      }
      return result;
    }

    return this._freqData;
  }

  /**
   * 获取时域波形数据
   * @param {object} [opts]
   *   opts.normalized: 是否归一化到 -1~1（默认 false，返回 0~255）
   * @returns {Uint8Array|Float32Array} 时域数据，长度 = fftSize
   */
  timeData(opts) {
    if (!this._analyserNode) return null;
    let normalized = opts && opts.normalized;

    if (!this._timeData || this._timeData.length !== this._analyserNode.fftSize) {
      this._timeData = new Uint8Array(this._analyserNode.fftSize);
    }

    this._analyserNode.getByteTimeDomainData(this._timeData);

    if (normalized) {
      let result = new Float32Array(this._timeData.length);
      for (let i = 0; i < this._timeData.length; i++) {
        result[i] = (this._timeData[i] - 128) / 128;
      }
      return result;
    }

    return this._timeData;
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
  _af(name) {
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
          this._bb();
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
   *   'vol'        → 输出音量 0~1（等同 'volume'，受 muted 与全局音量影响）
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
      let ap = this._af(key);
      if (ap) return ap.value;
      // 规格表内的键优先回读
      let spec = Awdio._optByKey[key];
      if (spec && spec.read) return spec.read(this);
      if (spec) return this['_' + key];
      // 常见别名
      if (key === 'speed') return this._speed;
      return this._params[key];
    }

    if (val === null) {
      // 删除
      let ap = this._af(key);
      if (ap) {
        ap.value = ap.defaultValue || 0;
      }
      if (key === 'pan' && this._stereoPanner) {
        this._stereoPanner.disconnect();
        this._stereoPanner = null;
        this._bb();
      }
      if (key === 'loop') {
        this.loop(false);
        return this;
      }
      delete this._params[key];
      return this;
    }

    // 设置：'vol' / 'volume' 是同一个东西（0~1），统一走 volume 语义
    // 这样才会正确处理 muted 与全局音量，不会直写 gain 绕过它们
    if (key === 'vol' || key === 'volume') {
      this._be('volume', val);
      return this;
    }

    // 设置：路由到真实 AudioParam
    let ap = this._af(key);
    if (ap) {
      if (key === 'gain') {
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

    // 规格表内的键（freq/speed/loop/volume/... 统一走 _be）
    if (this._be(key, val)) return this;

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
    let ap = this._af(paramName);
    if (!ap) {
      console.warn('Awdio: ramp() 不支持的参数名:', paramName);
      return this;
    }
    let now = this._ctx.currentTime;
    let startTime = now + (delay || 0);
    let endTime = startTime + duration;

    let clamped = target;
    if (paramName === 'vol') clamped = Math.max(0, Math.min(1, target));
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
    let ap = this._af(paramName);
    if (!ap) {
      console.warn('Awdio: expoRamp() 不支持的参数名:', paramName);
      return this;
    }
    let now = this._ctx.currentTime;
    let startTime = now + (delay || 0);
    let endTime = startTime + duration;

    let clamped = target;
    if (paramName === 'vol') clamped = Math.max(0, Math.min(1, target));
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
    let ap = this._af(paramName);
    if (!ap) {
      console.warn('Awdio: setAtTime() 不支持的参数名:', paramName);
      return this;
    }
    let now = this._ctx.currentTime;
    let t = now + (time || 0);

    let clamped = value;
    if (paramName === 'vol') clamped = Math.max(0, Math.min(1, value));
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
      let ap = this._af(name);
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
   * 支持 .clone()  /  .clone({ volume: 0.5 })  /  .clone("sine")  /  .clone("https://...")  /  .clone(fn)
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
      if (Awdio._an(arg)) {
        currentOpts.formula = Awdio._formulas.get(arg) || null;
        currentOpts.type = arg;
        currentOpts.src = null;
      } else if (Awdio._am(arg) || Awdio._ak(arg)) {
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
    this._ac('clone', { instance: newInstance, opts: arg });
    return newInstance;
  }

  // ==================== 音频片段 (clip) ====================

  /**
   * 定义命名片段
   * @param {string} name - 片段名称，之后可通过 .play(name) 播放
   * @param {number} from - 起始时间 毫秒
   * @param {number} to - 结束时间 毫秒
   * @returns {Awdio} this
   *
   * 示例：sfx.defineClip('laser', 0, 500).defineClip('boom', 1000, 2000)
   *       sfx.play('laser')
   */
  defineClip(name, from, to) {
    if (!this._clip) this._clip = {};
    this._clip[name] = [Math.max(0, from || 0), Math.max(from, to || from + 1000)];
    return this;
  }

  /**
   * 创建音频片段的新实例（共享源 buffer，不重复加载）
   * @param {number} start - 起始时间 毫秒
   * @param {number} [end] - 结束时间 毫秒（不传则到末尾）
   * @returns {Awdio} 新的 Awdio 实例，仅播放该片段
   *
   * 示例：sfx.clip(0, 1000).play()   // 播放 0~1000ms
   *       sfx.clip(2000).play()      // 播放 2000ms 到末尾
   */
  clip(start, end) {
    let startMs = Math.max(0, start || 0);
    let endMs;
    if (end != null) {
      endMs = Math.max(startMs, end);
    } else if (this._buffer) {
      endMs = this._buffer.duration * 1000;
    } else {
      endMs = startMs + 1000;
    }
    let durationMs = endMs - startMs;

    let opts = this.getOption();
    delete opts.name;
    opts.autoplay = false;
    opts._clipSlice = [startMs / 1000, durationMs / 1000];

    let sliced = new Awdio(opts);
    // 共享父实例的 buffer（避免重复加载）
    if (this._buffer) {
      sliced._buffer = this._buffer;
    }
    // clip 默认 poly 模式，允许多片段同时播放
    sliced._poly = true;

    return sliced;
  }

  // ==================== destroy 方法 ====================

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    // 清理 then 回调定时器
    if (this._thenTimers) {
      this._thenTimers.forEach(id => clearTimeout(id));
      this._thenTimers = [];
    }
    this._thenCallbacks = [];

    // 清理 HTML5 音频
    if (this._htmlAudio) {
      this._htmlAudio.pause();
      this._htmlAudio.src = '';
      if (this._htmlAudioListeners) {
        this._htmlAudio.removeEventListener('play', this._htmlAudioListeners.onPlay);
        this._htmlAudio.removeEventListener('pause', this._htmlAudioListeners.onPause);
        this._htmlAudio.removeEventListener('ended', this._htmlAudioListeners.onEnded);
        this._htmlAudio.removeEventListener('error', this._htmlAudioListeners.onError);
        this._htmlAudio.removeEventListener('timeupdate', this._htmlAudioListeners.onTimeUpdate);
        this._htmlAudio.removeEventListener('loadedmetadata', this._htmlAudioListeners.onLoaded);
        this._htmlAudioListeners = null;
      }
      this._htmlAudio.remove();
      this._htmlAudio = null;
    }
    if (this._htmlClipTimer) { clearTimeout(this._htmlClipTimer); this._htmlClipTimer = null; }
    // 从全局 HTML5 实例列表中移除
    if (Awdio._htmlAudioInstances) Awdio._htmlAudioInstances.delete(this);

    // 回收 load(file) 创建的 object URL
    if (this._objectUrl) {
      try { URL.revokeObjectURL(this._objectUrl); } catch (e) {}
      this._objectUrl = null;
    }

    this._bg();
    if (this._releaseTimeoutId) clearTimeout(this._releaseTimeoutId);
    if (this._fadeOutTimer) { clearTimeout(this._fadeOutTimer); this._fadeOutTimer = null; }
    if (this._fadeOutInterval) { clearInterval(this._fadeOutInterval); this._fadeOutInterval = null; }
    if (this._chorusLFO) { try { this._chorusLFO.stop(); this._chorusLFO.disconnect(); } catch (e) {} }
    if (this._phaserLFOs) {
      this._phaserLFOs.forEach(l => { try { l.stop(); l.disconnect(); } catch (e) {} });
    }
    if (this._delayNode) {
      try { this._delayNode.disconnect(); } catch (e) {}
      try { this._delayFeedback.disconnect(); } catch (e) {}
      if (this._delayFilter) { try { this._delayFilter.disconnect(); } catch (e) {} }
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
    if (this._analyserNode) this._analyserNode.disconnect();
    this._gainNode.disconnect();
    this._bq();
    this._bn();
    Awdio._instances.delete(this._name);

    this._ac('destroy', { name: this._name });
    this._events = {};
  }
}

// ==================== _AwdioManager 内部类 ====================

class _AwdioManager extends _AwdioBase {
  constructor(instances, opts = {}, mode = 'sequential') {
    super();
    this._items = instances.filter(i => i instanceof Awdio);
    this._mode = mode;
    this._repeat = Awdio._as(opts.loop);
    this._repeatCount = 0;   // 已完成的整队列遍数
    this._repeatDone = false;
    this._thenCallbacks = [];
    this._thenTimers = [];
    this._delay = opts.delay || 0;
    this._initFade(opts);
    this._autoplay = opts.autoplay || false;
    this._pauseOnBack = opts.pauseOnBack !== undefined ? opts.pauseOnBack : true;

    this._currentIndex = -1;
    this._playing = false;
    this._paused = false;
    this._stopped = false;
    this._wasPausedByGlobal = false;
    this._wasPausedByBackground = false;
    this._timeoutId = null;
    this._timeoutIds = []; // 并行模式下的多个延迟定时器
    this._currentPlaying = null;
    this._currentEndHandler = null; // 当前播放项的 end 监听（供 next/prev 移除）
    this._events = {};
    this._perItemDelays = []; // 逐项延迟（毫秒），与 _items 一一对应

    // autoplay
    if (this._autoplay && this._items.length > 0) {
      this.play();
    }

    this._h();
  }

  _ac(event, data) {
    (this._events[event] || []).forEach(fn => {
      try { fn.call(this, data); } catch (e) {}
    });
    if (event === 'end') {
      this._ae();
      this._bq();
      Awdio._managers.delete(this);
    }
  }

  _bu() { return this._playing && !this._paused && this._pauseOnBack; }
  _bs() { this._wasPausedByBackground = true; this.pause(); }
  _bt() { this.play(); }

  /**
   * 清除所有挂起的延迟定时器（顺序 + 并行）
   */
  _n() {
    if (this._timeoutId) { clearTimeout(this._timeoutId); this._timeoutId = null; }
    if (this._timeoutIds) {
      this._timeoutIds.forEach(id => clearTimeout(id));
      this._timeoutIds = [];
    }
  }

  /**
   * 注册一个延迟定时器（统一管理，便于暂停/停止时清理）
   */
  _bd(fn, ms) {
    let id = setTimeout(fn, ms);
    if (this._timeoutIds) this._timeoutIds.push(id);
    else this._timeoutId = id;
    return id;
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
          this._ac('play', { index: i, instance: item });
        }
      });
    } else {
      if (this._mode === 'parallel') {
        this._ax();
      } else if (this._paused && this._currentIndex >= 0 && this._currentIndex < this._items.length) {
        // 暂停后恢复：继续播放当前项（从暂停位置继续），而不是从头
        let item = this._items[this._currentIndex];
        this._currentPlaying = item;
        item.play();
        this._ac('play', { index: this._currentIndex, instance: item });
      } else {
        // 重新播放：重置重复计数
        this._repeatCount = 0;
        this._repeatDone = false;
        this._ay(0);
      }
    }
    return this;
  }

  pause(...indices) {
    if (indices.length === 0) {
      this._paused = true;
      this._n();
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
    this._n();
    if (this._thenTimers) {
      this._thenTimers.forEach(id => clearTimeout(id));
      this._thenTimers = [];
    }
    this._items.forEach(item => item.stop());
    this._currentIndex = -1;
    this._currentPlaying = null;
    this._currentEndHandler = null;
    this._repeatCount = 0;
    this._repeatDone = false;
    this._bq();
    Awdio._managers.delete(this);
    this._ac('stop');
    return this;
  }

  _ay(startIndex) {
    if (this._stopped) return;

    this._playing = true;
    this._currentIndex = startIndex;

    if (this._currentIndex >= this._items.length) {
      this._playing = false;
      this._repeatCount++;
      if (this._repeat === Infinity) {
        this._ay(0);
      } else if (!this._repeatDone && this._repeatCount < this._repeat) {
        this._ac('loop', { count: this._repeatCount, total: this._repeat });
        this._ay(0);
      } else {
        this._repeatDone = true;
        this._ac('end', { count: this._repeatCount, total: this._repeat, repeated: this._repeat > 1 });
      }
      return;
    }

    let item = this._items[this._currentIndex];
    this._currentPlaying = item;

    let origRepeat = item._repeat;
    item._repeat = 1;   // 队列内每一项只播一遍，循环由队列控制

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
      this._currentEndHandler = null;
      item._repeat = origRepeat;
      this._currentPlaying = null;
      let idx = this._currentIndex;
      this._currentIndex++;
      let perDelay = (this._perItemDelays && this._perItemDelays[idx] > 0) ? this._perItemDelays[idx] : this._delay;
      if (perDelay > 0) {
        this._bd(() => {
          this._ay(this._currentIndex);
        }, perDelay);
      } else {
        this._ay(this._currentIndex);
      }
    };

    this._currentEndHandler = onEnd;
    item.on('end', onEnd);
    item.play();
    this._ac('play', { index: this._currentIndex, instance: item });
  }

  // ==================== 队列导航 ====================

  /**
   * 停止当前播放项并清除挂起的延迟，但保留队列管理器状态
   * （供 next/prev/setPlay 切换曲目时使用）
   */
  _bh() {
    this._n();
    let cur = this._currentPlaying;
    if (cur) {
      if (this._currentEndHandler) {
        cur.off('end', this._currentEndHandler);
        this._currentEndHandler = null;
      }
      cur.stop();
      this._currentPlaying = null;
    }
    // 停止并行模式下其它仍在播放的项
    if (this._mode === 'parallel') {
      this._items.forEach(it => { if (it.playing) it.stop(); });
    }
  }

  /**
   * 从指定索引开始播放（sequential 走顺序链路；parallel 仅播该项）
   * @param {number} index - 0-based 索引
   */
  _az(index) {
    if (index < 0 || index >= this._items.length) return;
    this._playing = true;
    this._paused = false;
    this._stopped = false;
    this._wasPausedByBackground = false;
    this._repeatDone = false;
    // 重新注册为活跃管理器（可能已被 end 移除）并恢复后台暂停监听
    Awdio._managers.add(this);
    this._h();

    if (this._mode === 'sequential') {
      this._ay(index);
    } else {
      this._currentIndex = index;
      let item = this._items[index];
      this._currentPlaying = item;
      item.play();
      this._ac('play', { index, instance: item });
    }
  }

  /**
   * 播放队列中指定位置（1-based，1 = 第一首）
   * @param {number} index - 第几首
   * @returns {this}
   *
   * 示例：mgr.setPlay(1)  // 播放队列第一首
   *       mgr.setPlay(3)  // 播放队列第三首
   */
  setPlay(index) {
    if (this._items.length === 0) return this;
    let i = Math.floor(Number(index)) - 1;
    if (isNaN(i) || i < 0 || i >= this._items.length) return this;
    this._bh();
    this._az(i);
    return this;
  }

  /**
   * 下一首：相对当前曲目往后跳 n 首（缺省 1，越界回绕到队首）
   * @param {number} [n] - 步数，默认 1
   * @returns {this}
   *
   * 示例：mgr.next()    // 下一首
   *       mgr.next(2)   // 下两首
   */
  next(n) {
    if (this._items.length === 0) return this;
    let step = (n === undefined || n === null) ? 1 : Math.max(1, Math.floor(Number(n)) || 1);
    let target;
    if (this._currentIndex < 0 || this._currentIndex >= this._items.length) {
      target = 0; // 尚未播放或已播完：从队首开始
    } else {
      target = (this._currentIndex + step) % this._items.length;
    }
    this._bh();
    this._az(target);
    return this;
  }

  /**
   * 上一首：相对当前曲目往前跳 n 首（缺省 1，越界回绕到队尾）
   * @param {number} [n] - 步数，默认 1
   * @returns {this}
   *
   * 示例：mgr.prev()    // 上一首
   *       mgr.prev(2)   // 上两首
   */
  prev(n) {
    if (this._items.length === 0) return this;
    let step = (n === undefined || n === null) ? 1 : Math.max(1, Math.floor(Number(n)) || 1);
    let target;
    if (this._currentIndex < 0 || this._currentIndex >= this._items.length) {
      target = this._items.length - 1; // 尚未播放或已播完：从队尾开始
    } else {
      target = (this._currentIndex - step) % this._items.length;
      if (target < 0) target += this._items.length;
    }
    this._bh();
    this._az(target);
    return this;
  }

  _ax() {
    if (this._stopped) return;
    this._playing = true;

    // 并行模式下各 item 各自计轮次：全部播完一遍算整个组完成一轮
    let pending = this._items.length;
    let roundDone = false;

    let onRoundEnd = () => {
      if (roundDone || this._stopped) return;
      pending--;
      if (pending > 0) return;
      roundDone = true;
      this._repeatCount++;
      if (this._repeat === Infinity) {
        this._repeatCount--;   // 无限循环不累计
        this._bd(() => {
          if (!this._stopped) this._ax();
        }, Math.max(0, this._delay));
      } else if (!this._repeatDone && this._repeatCount < this._repeat) {
        this._ac('loop', { count: this._repeatCount, total: this._repeat });
        this._bd(() => {
          if (!this._stopped) this._ax();
        }, Math.max(0, this._delay));
      } else {
        this._repeatDone = true;
        this._playing = false;
        this._ac('end', { count: this._repeatCount, total: this._repeat, repeated: this._repeat > 1 });
      }
    };

    // 支持逐项延迟：[a, 60, b, 100, c] → a@0ms, b@60ms, c@160ms（数字累加到其后 item 的启动时刻）
    let cumulative = 0;
    this._items.forEach((item, index) => {
      if (index >= 1) {
        let itemDelay = (this._perItemDelays && this._perItemDelays[index] > 0) ? this._perItemDelays[index] : 0;
        cumulative += itemDelay;
      }

      let startItem = () => {
        if (this._stopped) return;
        if (this._fadeIn || item._fadeIn) {
          item._fadeIn = true;
          item._fadeInDuration = this._fadeInDuration || item._fadeInDuration;
        }
        if (this._fadeOut || item._fadeOut) {
          item._fadeOut = true;
          item._fadeOutDuration = this._fadeOutDuration || item._fadeOutDuration;
        }

        // 并行模式：单项循环交给 loop 计数统一控制
        let needTrack = this._repeat > 1;
        if (needTrack) {
          item._repeat = 1;
        }

        item.play();
        this._ac('play', { index, instance: item });

        if (needTrack) {
          let onItemEnd = () => {
            item.off('end', onItemEnd);
            onRoundEnd();
          };
          item.on('end', onItemEnd);
        } else {
          onRoundEnd();
        }
      };

      if (cumulative > 0) {
        this._bd(startItem, cumulative);
      } else {
        startItem();
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
    // 同步 _perItemDelays
    if (this._perItemDelays && this._perItemDelays.length > index) {
      this._perItemDelays.splice(index, 1);
    }
    // 更新 _currentIndex：如果移除的元素在当前索引之前，需要减 1
    if (this._currentIndex > index) {
      this._currentIndex--;
    }
    return this;
  }

  add(item, position) {
    let instance = Awdio._bc(item);
    if (!instance) return this;

    let pos = (position === undefined || position >= this._items.length) ? this._items.length : Math.max(0, position);
    this._items.splice(pos, 0, instance);
    // 同步 _perItemDelays（新增项默认延迟 0）
    if (this._perItemDelays) {
      this._perItemDelays.splice(pos, 0, 0);
    }
    // 更新 _currentIndex：如果插入位置在当前索引之前，需要加 1
    if (this._currentIndex >= pos) {
      this._currentIndex++;
    }
    return this;
  }

  toggle(a, b) {
    if (a < 0 || a >= this._items.length || b < 0 || b >= this._items.length) return this;
    let temp = this._items[a];
    this._items[a] = this._items[b];
    this._items[b] = temp;
    // 同步 _perItemDelays
    if (this._perItemDelays) {
      let tempDelay = this._perItemDelays[a];
      this._perItemDelays[a] = this._perItemDelays[b] || 0;
      this._perItemDelays[b] = tempDelay || 0;
    }
    // 更新 _currentIndex 和 _currentPlaying
    if (this._currentIndex === a) {
      this._currentIndex = b;
      this._currentPlaying = this._items[b];
    } else if (this._currentIndex === b) {
      this._currentIndex = a;
      this._currentPlaying = this._items[a];
    }
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

});

// 别名 Aw
if (typeof window !== 'undefined') { window.Aw = window.Awdio; }