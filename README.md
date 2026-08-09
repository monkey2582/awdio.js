#Awdio.js

轻量级 Web Audio 音频库 —— 合成、公式、3D 空间、效果链、队列/并行播放，全链式调用。

https://img.shields.io/badge/version-3.5.0-blue https://img.shields.io/badge/license-MIT-green https://img.shields.io/badge/minified-~20KB-brightgreen

---

🎵 特性

· 合成波形 – 内置 50+ 种声音（基础波、乐器、打击乐、FM、效果音等）
· 自定义公式 – 使用数学函数定义任意声音，支持注册复用
· 文件播放 – 支持 HTTP/HTTPS、本地路径、Data URI，带加载进度
· 3D 空间音频 – 基于 Web Audio PannerNode，支持 HRTF 定位
· 音效链 – 滤波器（Filter）、压缩器（Compressor）、混响（Reverb）、合唱（Chorus）、ADSR 包络
· 队列/并行播放 – 顺序播放、同时播放，支持循环、延时、淡入淡出
· 多设备输出 – 全局/实例级指定音频输出设备（扬声器、耳机等），支持同时输出到多个设备
· 实例管理 – 命名、克隆、销毁，事件系统（play/end/load/error/mute 等）
· 链式调用 – 所有方法返回 this，流畅书写

---

📦 安装

通过 <script> 标签引入

```html
<script src="awdio.min.js"></script>
<script>
  const audio = new Awdio('sine');
  audio.play();
</script>
```

通过 npm（推荐）

```bash
npm install awdio
```

然后：

```javascript
import Awdio from 'awdio';   // ES Module
// 或
const Awdio = require('awdio');
```

通过 CDN

```html
<script src="https://unpkg.com/awdio@3.5.0/awdio.min.js"></script>
```

---

🚀 快速开始

1. 播放一个正弦波

```javascript
const sound = new Awdio('sine', { freq: 440, volume: 80 });
sound.play();
```

2. 加载并播放网络音频

```javascript
const music = new Awdio('https://example.com/music.mp3');
music.on('load', () => music.play());
```

3. 使用自定义公式

```javascript
// 定义一种“衰减正弦”公式
Awdio.defineFormula('myWave', (t, freq) => {
  return Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 2);
});

const custom = new Awdio('myWave', { freq: 300 });
custom.play();
```

4. 链式调用 + 效果

```javascript
new Awdio('guitar')
  .reverb({ room: 0.6, mix: 0.3 })
  .filter({ freq: 2000, type: 'lowpass' })
  .spatial({ x: 5, y: 0, z: -10 })
  .volume(70)
  .play();
```

5. 队列播放（顺序）

```javascript
const a = new Awdio('piano');
const b = new Awdio('bell');
const c = new Awdio('flute');

Awdio.queue(a, b, c, { delay: 200, loop: true }).play();
```

6. 并行播放（同时）

```javascript
Awdio.playAll('kick', 'snare', 'hihat', { loop: true }).play();
```

---

📖 API 概览

静态方法

方法 说明
Awdio.getContext() 获取共享 AudioContext
Awdio.setGlobalVolume(vol) 设置全局音量（0-100）
Awdio.setGlobalOutput(deviceId) 设置全局输出设备（字符串或数组）
Awdio.getAllDevices() 获取所有音频输出设备列表
Awdio.defineFormula(name, fn) 注册自定义公式
Awdio.listener(opts) 设置 3D 监听者位置/朝向
Awdio.queue(...items, opts) 创建顺序播放队列
Awdio.playAll(...items, opts) 创建并行播放管理器

实例方法

方法 说明
play() / pause() / stop() 播放控制
seek(time) 跳转到指定位置
set(opts) / setVolume(vol) 设置选项/音量
mute() 静音切换
clone(opts?) 克隆当前实例
delay(ms) 延迟播放（毫秒）
fadeOut(duration) 淡出并停止
spatial(opts) 设置 3D 位置
filter(opts) 滤波器效果
reverb(opts) 混响效果
comp(opts) 压缩器效果
chorus(opts) 合唱效果
envelope(opts) ADSR 包络
device(deviceId) 实例级输出设备设置
on(event, fn) / off(event, fn) 事件绑定

更多详细 API 请参阅 TypeScript 声明文件。

---

🧪 内置波形类型

基础波

sine, square, sawtooth, triangle, noise, cosine, tan, pulse

乐器模拟

organ, bell, guitar, piano, strings, brass, flute, cello, violin, harp, marimba, vibraphone

管乐器

clarinet, oboe, bassoon, trumpet, trombone, tuba

打击乐

kick, snare, hihat, pluck, tom, clap, crash, ride, cowbell, rimshot

FM 合成

epiano, fm_bell, fm_bass, fm_lead

模拟合成器

synth_bass, synth_lead, synth_pad, supersaw, sub_bass

效果音

laser, sweep, bubble, click

---

🔧 构建与开发

```bash
git clone https://github.com/yourname/awdio.git
cd awdio
# 安装依赖（如果需要）
# 修改源码后可直接使用
```

---

🌐 浏览器兼容性

· Chrome / Edge / Firefox / Safari（最新两个版本）
· 需支持 Web Audio API（IE 不支持）

---

📄 许可证

MIT

---

🤝 贡献

欢迎提交 Issue 和 Pull Request。请确保代码风格一致，并补充相应的测试（如果有）。

---

🙏 致谢

本项目基于 Web Audio API 构建，感谢开源社区提供的灵感与支持。
