## 16 个星座完整数据设计

以下所有坐标均为归一化 `[0, 1]` 空间，参考 IAU 星图的真实几何比例关系。

---

### 1. Orion（猎户座）— 冬夜之王

**神话**：傲慢的猎人俄里翁，声称能杀尽世间万兽，被大地女神盖亚派出的巨蝎刺死。

**天文特征**：Betelgeuse（参宿四）是红超巨星，肉眼可见的橙红色；Rigel（参宿七）是蓝超巨星，全天第七亮星。腰带三星几乎等距排列。

```
points:
  0: Betelgeuse   (0.22, 0.12)  size=3.8  color=#ff8c42  hasSpike=true   ← 左肩 · 红超巨星
  1: Bellatrix     (0.78, 0.18)  size=2.2  color=#a2c0ff                   ← 右肩 · 蓝巨星
  2: Mintaka       (0.43, 0.46)  size=2.0  color=#e4e8ff                   ← 腰带右 (δ)
  3: Alnilam       (0.50, 0.48)  size=2.4  color=#e4e8ff  hasSpike=true   ← 腰带中 (ε) · 最亮
  4: Alnitak       (0.57, 0.50)  size=2.0  color=#e4e8ff                   ← 腰带左 (ζ)
  5: Saiph         (0.28, 0.85)  size=2.0  color=#a2c0ff                   ← 左膝
  6: Rigel         (0.75, 0.88)  size=4.2  color=#80abff  hasSpike=true   ← 右足 · 蓝超巨星

links: [0,2], [1,4], [2,3], [3,4], [2,5], [4,6]
preferredSlots: ["night"]
weight: 1.2
defaultScale: 1.0
```

> **设计要点**：沙漏轮廓。肩→腰→足的三层对称，腰带三星间距均匀。Betelgeuse 和 Rigel 形成「红↔蓝」色温对角线。

---

### 2. Scorpio（天蝎座）— 大地之蝎

**神话**：受盖亚之命杀死猎户的巨蝎。宙斯将它们放在天球的对角——当天蝎座升起时，猎户座落下，永世不得相见。

**天文特征**：Antares（心宿二，"火星的对手"）是红超巨星 M1.5，直径约太阳 700 倍。尾巴呈经典的 J 形钩。

```
points:
  0: Graffias β   (0.08, 0.12)  size=2.0  color=#a2c0ff                   ← 钳左
  1: Dschubba δ   (0.20, 0.08)  size=2.2  color=#a2c0ff                   ← 钳右
  2: π Sco        (0.25, 0.22)  size=1.8  color=#ffffff                   ← 头部
  3: σ Sco        (0.22, 0.35)  size=1.6  color=#ffffff                   ← 颈
  4: Antares α    (0.28, 0.48)  size=4.5  color=#ff4d4d  hasSpike=true   ← 心脏 · 红超巨星
  5: τ Sco        (0.32, 0.58)  size=1.6  color=#a2c0ff                   ← 腰
  6: ε Sco        (0.42, 0.68)  size=1.8  color=#ffffff                   ← 尾弯 1
  7: μ¹ Sco       (0.55, 0.78)  size=1.6  color=#ffffff                   ← 尾弯 2
  8: ζ Sco        (0.68, 0.85)  size=1.6  color=#ffffff                   ← 尾弯 3
  9: η Sco        (0.80, 0.88)  size=1.8  color=#ffffff                   ← 尾端
  10: Shaula λ    (0.90, 0.80)  size=2.5  color=#a2c0ff  hasSpike=true   ← 毒刺
  11: Lesath υ    (0.88, 0.72)  size=1.8  color=#a2c0ff                   ← 毒刺伴星

links: [0,1], [1,2], [2,3], [3,4], [4,5], [5,6], [6,7], [7,8], [8,9], [9,10], [10,11]
preferredSlots: ["dusk", "night"]
weight: 1.0
defaultScale: 1.1
```

> **设计要点**：上半部（钳+心）紧密，下半部（尾）逐渐拉长，最后一个钩形回弯（Shaula→Lesath）是经典的蝎尾。

---

### 3. BigDipper（北斗七星）— 天帝御车

**神话**：美丽的仙女卡利斯托被赫拉嫉妒变成大熊，她的儿子阿卡斯差点射杀她。宙斯将母子双双升天，分别成为大熊座与小熊座。

**天文特征**：Mizar（开阳）旁有伴星 Alcor（辅），古代阿拉伯人用它测视力。Dubhe-Merak 连线指向北极星。

```
points:
  0: Alkaid η     (0.05, 0.28)  size=2.2  color=#a2c0ff                   ← 斗柄尖
  1: Mizar ζ      (0.20, 0.38)  size=2.0  color=#ffffff                   ← 开阳 (旁有辅星)
  2: Alioth ε     (0.35, 0.48)  size=2.8  color=#ffffff  hasSpike=true   ← 玉衡 · 最亮星
  3: Megrez δ     (0.50, 0.55)  size=1.5  color=#ffffff                   ← 天权 · 连接点
  4: Phecda γ     (0.52, 0.80)  size=2.2  color=#ffffff                   ← 天玑
  5: Merak β      (0.78, 0.85)  size=2.2  color=#ffffff                   ← 天璇 · 指极星
  6: Dubhe α      (0.82, 0.58)  size=2.6  color=#ffd2a1  hasSpike=true   ← 天枢 · K型橙星

links: [0,1], [1,2], [2,3], [3,4], [4,5], [5,6], [6,3]
preferredSlots: ["dawn", "dusk", "night"]
weight: 1.2
defaultScale: 1.0
```

> **设计要点**：柄从左上弯曲至中心，斗口在右侧闭合为梯形。Dubhe 是唯一橙色星（K 型），其余白色——这符合真实色温。

---

### 4. UrsaMinor（小熊座）— 北极之子

**神话**：阿卡斯，卡利斯托之子。小熊座的尾端是北极星——全天最重要的导航星。

**天文特征**：Polaris（勾陈一）并非完全不动，它是地轴指向附近的一颗 F7 超巨星。Kochab（帝星）和 Pherkad（太子）组成"卫极双星"。

```
points:
  0: Polaris α    (0.12, 0.10)  size=4.0  color=#fff4e8  hasSpike=true   ← 北极星 · F7超巨星
  1: Yildun δ     (0.25, 0.22)  size=1.5  color=#ffffff
  2: ε UMi        (0.38, 0.35)  size=1.5  color=#ffffff
  3: ζ UMi        (0.52, 0.48)  size=1.8  color=#ffffff                   ← 连接点
  4: η UMi        (0.72, 0.52)  size=1.6  color=#ffffff
  5: Kochab β     (0.85, 0.75)  size=2.5  color=#ffb56c                   ← 帝星 · K4巨星
  6: Pherkad γ    (0.65, 0.82)  size=2.2  color=#ffffff                   ← 太子

links: [0,1], [1,2], [2,3], [3,4], [4,5], [5,6], [6,3]
preferredSlots: ["dawn", "dusk", "night"]
weight: 1.0
defaultScale: 0.8
```

---

### 5. Cassiopeia（仙后座）— 被罚的王后

**神话**：仙后卡西奥佩亚吹嘘女儿安德洛墨达比海中仙女更美，触怒海神波塞冬。她被罚在天球上头朝下旋转，永远无法安息。

**天文特征**：经典 W 形，5 颗 2-3 等星。极易辨识，与北斗隔北极星对望。

```
points:
  0: Caph β       (0.08, 0.55)  size=2.0  color=#fff4e8                   ← W的左端
  1: Schedar α    (0.28, 0.25)  size=2.8  color=#ffd2a1  hasSpike=true   ← 王良一 · K0巨星
  2: Navi γ       (0.50, 0.60)  size=2.5  color=#a2c0ff                   ← W的中谷
  3: Ruchbah δ    (0.72, 0.22)  size=2.2  color=#e4e8ff                   ← W的右峰
  4: Segin ε      (0.92, 0.52)  size=1.8  color=#a2c0ff                   ← W的右端

links: [0,1], [1,2], [2,3], [3,4]
preferredSlots: ["dusk", "night"]
weight: 1.0
defaultScale: 1.1
```

> **设计要点**：y 坐标 `0.55→0.25→0.60→0.22→0.52` 形成清晰的 W 形折线。

---

### 6. 天鹅座 Cygnus — 银河之桥

**神话**：宙斯化身天鹅接近斯巴达王后勒达。在东亚传说中，天鹅是七夕的喜鹊桥。

**天文特征**：天津四（Deneb）是 A2 超巨星，绝对光度是太阳的 20 万倍，却因距离遥远（2600 光年）排在全天第 19 亮星。Albireo（辇道增七）是最著名的金+蓝双星。

```
points:
  0: Deneb α      (0.50, 0.10)  size=3.5  color=#a2c0ff  hasSpike=true   ← 天津四 · 尾巴
  1: Sadr γ       (0.50, 0.45)  size=2.2  color=#fff4e8                   ← 天津一 · 身体十字心
  2: Gienah ε     (0.18, 0.38)  size=2.0  color=#ffb56c                   ← 左翼
  3: Delta Cyg    (0.82, 0.38)  size=2.0  color=#a2c0ff                   ← 右翼
  4: Albireo β    (0.50, 0.88)  size=2.8  color=#ffd2a1  hasSpike=true   ← 辇道增七 · 鸟嘴 · 金蓝双星

links: [0,1], [1,2], [1,3], [1,4]
preferredSlots: ["night", "dusk"]
weight: 1.1
defaultScale: 1.0
```

> **设计要点**：完美的「†」十字形。Deneb 在顶、Albireo 在底，翼展对称。

---

### 7. 天琴座 Lyra — 俄耳甫斯的遗琴

**神话**：音乐之神俄耳甫斯死后，他的七弦琴被宙斯升入天空。织女星（Vega）是琴弦上最亮的一颗。在中国传说中，织女与牛郎隔银河相望。

**天文特征**：Vega 是全天第五亮星（0.03 等），A0 型蓝白星，距离仅 25 光年。Sheliak（渐台二）是著名的食变星。

```
points:
  0: Vega α       (0.50, 0.08)  size=4.8  color=#e4e8ff  hasSpike=true   ← 织女星 · A0主序
  1: ε¹ Lyr       (0.35, 0.30)  size=1.6  color=#ffffff                   ← 左肩
  2: ζ Lyr        (0.65, 0.28)  size=1.6  color=#ffffff                   ← 右肩
  3: Sheliak β    (0.30, 0.70)  size=2.2  color=#a2c0ff                   ← 渐台二 · 食变星
  4: Sulafat γ    (0.70, 0.68)  size=2.2  color=#a2c0ff                   ← 渐台三

links: [0,1], [0,2], [1,2], [1,3], [2,4], [3,4]
preferredSlots: ["night", "dusk"]
weight: 1.0
defaultScale: 0.85
```

> **设计要点**：Vega 独居顶端极亮，下方四星形成平行四边形（琴身）。上三角+下四边形=琴的轮廓。

---

### 8. 金牛座 Taurus — 宙斯的化身

**神话**：宙斯化为纯白公牛，掳走腓尼基公主欧罗巴渡海至克里特岛。毕宿五（Aldebaran）是牛的怒目。昴星团（Pleiades）是宙斯升天的七姐妹。

**天文特征**：Aldebaran 是 K5 巨星，橙红色直径约太阳 44 倍。昴星团是距太阳系最近的明亮疏散星团之一（约 444 光年）。

```
points:
  0: Aldebaran α  (0.35, 0.55)  size=3.8  color=#ff8c42  hasSpike=true   ← 毕宿五 · 牛眼
  1: θ¹ Tau       (0.42, 0.45)  size=2.0  color=#ffd2a1                   ← 毕宿团中心
  2: γ Tau        (0.28, 0.42)  size=1.8  color=#ffd2a1                   ← 毕宿V形左
  3: Elnath β     (0.78, 0.12)  size=2.5  color=#a2c0ff                   ← 五车五 · 左角尖
  4: ζ Tau        (0.88, 0.75)  size=2.2  color=#a2c0ff                   ← 天关 · 右角尖
  5: Pleiades     (0.08, 0.12)  size=3.2  color=#80abff                   ← 昴星团 · 七姐妹

links: [2,0], [2,1], [0,4], [1,3]
preferredSlots: ["night"]
weight: 0.9
defaultScale: 1.1
```

> **设计要点**：左侧 V 形（毕宿团+Aldebaran）是牛脸，两条线向右上/右下延伸是牛角。Pleiades 独立于左上角。

---

### 9. 双子座 Gemini — 永生的兄弟

**神话**：卡斯托耳（凡人之子）与波吕丢刻斯（宙斯之子），一凡一神的双胞胎。凡人的 Castor 战死后，不朽的 Pollux 恳求宙斯让他们共享生死——从此在天堂与冥界之间交替，永不分离。

**天文特征**：Castor 实际上是六重星系统。Pollux 是一颗 K0 巨星，发出温暖的橙色光。

```
points:
  0: Castor α     (0.62, 0.10)  size=2.8  color=#a2c0ff                   ← 北河二 · 六重星
  1: Pollux β     (0.38, 0.15)  size=3.2  color=#ffb56c  hasSpike=true   ← 北河三 · K0巨星
  2: Wasat δ      (0.68, 0.45)  size=1.8  color=#fff4e8                   ← 天樽二
  3: Mekbuda ζ    (0.32, 0.50)  size=1.8  color=#ffd2a1                   ← 天樽三
  4: Alhena γ     (0.22, 0.85)  size=2.5  color=#e4e8ff                   ← 井宿三 · A1白
  5: Alzirr ξ     (0.78, 0.82)  size=2.0  color=#fff4e8                   ← 井宿一

links: [0,2], [2,5], [1,3], [3,4]
preferredSlots: ["night", "dawn"]
weight: 0.9
defaultScale: 1.1
```

> **设计要点**：两条平行链从上（头）到下（足），Castor 线在右，Pollux 线在左。两兄弟并肩站立。

---

### 10. Leo（狮子座）— 尼米亚之狮

**神话**：赫拉克勒斯十二试炼的第一项：杀死刀枪不入的尼米亚狮。赫拉克勒斯最终将其扼杀，披上狮皮作为铠甲。宙斯将狮子升天纪念其勇猛。

**天文特征**：Regulus（轩辕十四）是颗 B7 矮星，高速自转导致赤道隆起。狮子座的"镰刀"（Sickle）是观星入门的标志性星群。

```
points:
  0: ε Leo        (0.85, 0.12)  size=1.8  color=#ffffff                   ← 镰刀顶
  1: μ Leo        (0.92, 0.28)  size=1.6  color=#ffb56c                   ← 镰刀弯
  2: ζ Leo        (0.88, 0.42)  size=1.8  color=#ffffff                   ← 镰刀基
  3: Regulus α    (0.75, 0.55)  size=3.8  color=#80abff  hasSpike=true   ← 轩辕十四 · B7蓝白
  4: η Leo        (0.48, 0.52)  size=2.2  color=#ffffff                   ← 腹部
  5: Denebola β   (0.12, 0.58)  size=2.5  color=#e4e8ff                   ← 五帝座一 · 尾尖
  6: δ Leo        (0.28, 0.38)  size=1.8  color=#ffffff                   ← 背部
  7: θ Leo        (0.50, 0.32)  size=2.0  color=#ffffff                   ← 背中

links: [0,1], [1,2], [2,3], [3,4], [4,5], [5,6], [6,7], [7,4]
preferredSlots: ["night"]
weight: 0.9
defaultScale: 1.1
```

> **设计要点**：右侧镰刀形（0→1→2→3）是狮头/鬃毛，左侧三角形（4→5→6→7）是躯干。Regulus 在"心脏"位。

---

### 11. Andromeda（仙女座）— 被锁链的公主

**神话**：仙后卡西奥佩亚的傲慢导致女儿安德洛墨达被献祭给海怪。英雄珀耳修斯飞来杀怪救美，二人成婚。

**天文特征**：M31（仙女座星系）是肉眼可见的最远天体——距离 254 万光年，它是一个比银河系还大的旋涡星系。Mirach（奎宿九）是找到 M31 的向导星。

```
points:
  0: Alpheratz α  (0.10, 0.15)  size=2.8  color=#a2c0ff  hasSpike=true   ← 壁宿二 · 蓝白
  1: δ And        (0.30, 0.28)  size=2.0  color=#ffffff
  2: Mirach β     (0.50, 0.42)  size=2.5  color=#ffb56c                   ← 奎宿九 · M0红巨星
  3: μ And        (0.68, 0.55)  size=1.8  color=#ffffff
  4: Almach γ     (0.85, 0.68)  size=2.5  color=#ffd2a1                   ← 天大将军一 · 金+蓝双星
  5: M31          (0.55, 0.22)  size=3.5  color=#8090cc                   ← 仙女座星系

links: [0,1], [1,2], [2,3], [3,4], [2,5]
preferredSlots: ["night"]
weight: 0.8
defaultScale: 1.0
```

---

### 12. Aries（白羊座）— 金羊毛

**神话**：背负兄妹弗里克索斯和赫勒渡海的金色飞羊。弗里克索斯到达科尔基斯后将金羊献祭，羊皮挂于圣林——这就是后来伊阿宋"阿尔戈号"远征所追寻的金羊毛。

```
points:
  0: Hamal α      (0.22, 0.25)  size=3.2  color=#ffb56c  hasSpike=true   ← 娄宿三 · K2巨星
  1: Sheratan β   (0.52, 0.48)  size=2.4  color=#ffffff                   ← 娄宿一
  2: Mesarthim γ  (0.72, 0.65)  size=2.0  color=#ffffff                   ← 娄宿二 · 著名双星
  3: 41 Ari       (0.15, 0.48)  size=1.5  color=#ffffff

links: [0,1], [1,2], [0,3]
preferredSlots: ["night", "dawn"]
weight: 0.7
defaultScale: 0.8
```

---

### 13. Corona Borealis（北冕座）— 阿里阿德涅的婚冠

**神话**：克里特公主阿里阿德涅给忒修斯线团助其走出迷宫，却被忒修斯抛弃于纳克索斯岛。酒神狄奥尼索斯迎娶了她，将她的婚礼花冠抛向天空化为此星座。

**天文特征**：7 颗星形成优雅的半圆弧，是全天最易辨识的小星座之一。Alphecca 意为"断环之珠"。

```
points:
  0: θ CrB        (0.08, 0.38)  size=1.5  color=#ffffff                   ← 弧左端
  1: β CrB        (0.20, 0.62)  size=1.8  color=#ffffff                   ← Nusakan
  2: Alphecca α   (0.38, 0.78)  size=3.0  color=#e4e8ff  hasSpike=true   ← 贯索四 · A0蓝白
  3: γ CrB        (0.55, 0.80)  size=2.0  color=#ffffff
  4: δ CrB        (0.70, 0.72)  size=1.8  color=#ffffff
  5: ε CrB        (0.82, 0.58)  size=1.6  color=#ffb56c                   ← K2巨星 微橙
  6: ι CrB        (0.92, 0.38)  size=1.5  color=#ffffff                   ← 弧右端

links: [0,1], [1,2], [2,3], [3,4], [4,5], [5,6]
preferredSlots: ["night"]
weight: 0.7
defaultScale: 0.9
```

---

### 14. 南十字座 Crux — 南方导航

**神话**：无经典希腊神话（因为太偏南，古希腊看不到）。对澳大利亚原住民而言是"鸸鹋的头"。对大航海时代的水手是南半球最重要的导航标记。

**天文特征**：全天最小的星座，但极其耀眼。Acrux 是 B0+B1 蓝白双星，Gacrux 是 M3 红巨星——形成一蓝一红的鲜明对比。

```
points:
  0: Gacrux γ     (0.48, 0.12)  size=2.8  color=#ff6b4d                   ← 十字架一 · M3红巨星
  1: Acrux α      (0.52, 0.88)  size=3.5  color=#80abff  hasSpike=true   ← 十字架二 · B型蓝
  2: Mimosa β     (0.15, 0.48)  size=3.0  color=#80abff                   ← 十字架三 · 蓝巨星
  3: δ Cru        (0.82, 0.42)  size=2.2  color=#a2c0ff                   ← 十字架四
  4: ε Cru        (0.58, 0.58)  size=1.2  color=#ffb56c                   ← 入侵者星 · 小橙星

links: [0,1], [2,3]
preferredSlots: ["night"]
weight: 0.8
defaultScale: 0.8
```

---

### 15. Perseus（英仙座）— 斩杀美杜莎的英雄 🆕

**神话**：珀耳修斯持哈尔佩弯刀，凭借雅典娜的铜盾反射，斩下蛇发女妖美杜莎之首。后来他飞过埃塞俄比亚海岸，救下被缚的安德洛墨达公主。

**天文特征**：Algol（大陵五，"恶魔之星"）是最著名的食变星——每 2.87 天亮度骤降一次，古人以为不祥。它代表美杜莎被砍下的头颅中闪烁的邪眼。每年 8 月的英仙座流星雨辐射点就在此。

```
points:
  0: Mirfak α     (0.45, 0.12)  size=3.2  color=#fff4e8  hasSpike=true   ← 天船三 · F5超巨星
  1: δ Per        (0.55, 0.28)  size=1.8  color=#a2c0ff
  2: ε Per        (0.62, 0.45)  size=1.6  color=#a2c0ff
  3: ζ Per        (0.70, 0.65)  size=1.6  color=#ffffff                   ← 身躯
  4: Algol β      (0.20, 0.38)  size=2.8  color=#c0a0ff  hasSpike=true   ← 大陵五 · 恶魔之眼 · 食变星
  5: ρ Per        (0.12, 0.58)  size=2.0  color=#ff8c42                   ← M4红巨星
  6: κ Per        (0.35, 0.75)  size=1.5  color=#ffffff

links: [0,1], [1,2], [2,3], [0,4], [4,5], [4,6]
preferredSlots: ["night", "dawn"]
weight: 0.8
defaultScale: 1.0
```

> **设计要点**：主链从 Mirfak 向右下延伸（英雄的身体），Algol 分支向左偏离（手持的美杜莎头颅）。Algol 使用紫色调 `#c0a0ff` 暗示其诡异的食变特性。

---

### 16. Aquila（天鹰座）— 宙斯的神鹰 / 牛郎 🆕

**神话**：宙斯的雷鹰，负责将特洛伊美少年伽倪墨得斯掠至奥林匹斯为众神斟酒。在东亚传说中，Altair（河鼓二）是牛郎星，与织女星隔银河相望，每年七夕由喜鹊搭桥相会。

**天文特征**：Altair（河鼓二）是距太阳仅 16.7 光年的 A7 主序星，自转极快（约 9 小时一圈），赤道因此被甩成扁的。它与 Tarazed（河鼓一，K3 橙巨星）和 Alshain（河鼓三）排成一条醒目的直线。

```
points:
  0: Altair α     (0.50, 0.42)  size=4.0  color=#e4e8ff  hasSpike=true   ← 河鼓二 · 牛郎 · A7
  1: Tarazed γ    (0.38, 0.25)  size=2.5  color=#ffb56c                   ← 河鼓一 · K3橙巨星
  2: Alshain β    (0.62, 0.58)  size=2.0  color=#fff4e8                   ← 河鼓三
  3: δ Aql        (0.25, 0.10)  size=1.8  color=#ffffff                   ← 左旗一
  4: λ Aql        (0.72, 0.82)  size=1.6  color=#ffffff                   ← 右翼尖
  5: θ Aql        (0.80, 0.65)  size=1.8  color=#a2c0ff                   ← 右翼

links: [3,1], [1,0], [0,2], [2,5], [5,4]
preferredSlots: ["night", "dusk"]
weight: 0.9
defaultScale: 0.95
```

> **设计要点**：河鼓三星（1→0→2）斜线排列是核心标志。从上到下延展形成飞翔姿态。

---

### 彩蛋配对完整数据

```typescript
EASTER_EGG_RULES = [
  // 1. 宿敌：天蝎刺杀猎户。真实天球上它们永不同时出现——这里是"不可能的相遇"
  { pair: ["Scorpio", "Orion"],          effect: "celestialGold", durationMs: 10000 },

  // 2. 夏季大三角(局部)：天鹅/天琴/天鹰三者构成银河上的音乐三角
  { pair: ["天鹅座 (Cygnus)", "天琴座 (Lyra)"], effect: "dualPulse", durationMs: 12000 },

  // 3. 冬夜王者：猎户追逐金牛。Aldebaran("追随者")追踪昴星团
  { pair: ["Orion", "金牛座 (Taurus)"],  effect: "celestialGold", durationMs: 10000 },

  // 4. 黄道邻居：双子座与狮子座在黄道上毗邻。Castor & Pollux 的不朽之约
  { pair: ["双子座 (Gemini)", "Leo"],    effect: "dualPulse",     durationMs: 8000  },

  // 5. 母女天罚：仙后的傲慢导致公主被献祭。天球上紧邻
  { pair: ["Andromeda", "Cassiopeia"],   effect: "celestialGold", durationMs: 10000 },

  // 6. 英雄救美 + 英仙座流星雨：Perseus 斩美杜莎、救 Andromeda
  { pair: ["Andromeda", "Perseus"],      effect: "meteor",        durationMs: 15000 },

  // 7. 母子寻星：Dubhe→Merak 连线指向 Polaris。天文学第一课
  { pair: ["BigDipper", "UrsaMinor"],    effect: "dualPulse",     durationMs: 10000 },

  // 8. 七夕传说：织女(Vega) 与 牛郎(Altair) 隔银河相望
  { pair: ["天琴座 (Lyra)", "Aquila"],   effect: "celestialGold", durationMs: 12000 },

  // 9. 音乐与王冠：Ariadne 的婚冠 + Orpheus 的琴。"失去后被天空铭记"
  { pair: ["Corona Borealis", "天琴座 (Lyra)"], effect: "dualPulse", durationMs: 8000 },

  // 10. 北天双极：北斗与仙后围绕北极星旋转时永远处于对角位置
  { pair: ["BigDipper", "Cassiopeia"],   effect: "meteor",        durationMs: 8000  },
]
```

---
