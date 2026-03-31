require("dotenv").config();

const app = require("./app");
const OpenAI = require("openai");
const scanNetwork = require("./scanNetwork");
const { isNpcapInstalled, installNpcap } = require("./checkNpcap");
const { spawn } = require("child_process");

const ispContacts = {
  "STC": "900",
  "Mobily": "1100",
  "Zain": "959",
  "STC Solutions": "920014400"
};

app.post("/api/devices", async (req, res) => {
  try {
    const result = await scanNetwork();
    console.log("Device scan result:", result);
    res.json(result);
  } catch (err) {
    console.error("Device scan error:", err);
    res.json({
      count: 0,
      devices: []
    });
  }
});

app.get("/api/check-npcap", async (req, res) => {
  try {
    const installed = await isNpcapInstalled();
    console.log("Npcap installed:", installed);
    res.json({ installed });
  } catch (err) {
    console.error("Npcap check error:", err);
    res.json({ installed: false });
  }
});

app.post("/api/install-npcap", async (req, res) => {
  try {
    console.log("Installing Npcap...");
    const success = await installNpcap();
    res.json({ success });
  } catch (err) {
    console.error("Npcap install error:", err);
    res.json({ success: false });
  }
});

app.get("/api/wifi-signal", (req, res) => {
  const proc = spawn("netsh", ["wlan", "show", "interfaces"], { windowsHide: true });
  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  proc.on("error", (err) => {
    console.error("WiFi signal detection error:", err.message);
    res.json({ signal: null });
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      console.error("netsh exited with code", code, stderr);
      return res.json({ signal: null });
    }
    const match = stdout.match(/Signal\s*:\s*(\d+)%/i);
    const signal = match ? parseInt(match[1], 10) : null;
    console.log("WiFi signal strength:", signal);
    res.json({ signal });
  });
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/api/analyze-ai", async (req, res) => {
  try {

    const { ping, jitter, download, upload, latencyUnderLoad, connection, isp, towerDistance, deviceCount, wifiSignal } = req.body;
    if (
      ping === undefined ||
      jitter === undefined ||
      download === undefined ||
      upload === undefined ||
      latencyUnderLoad === undefined ||
      !connection
    ) {
      return res.status(400).json({
        analysis: "بيانات ناقصة",
      });
    }

    // ================= CALCULATIONS =================

    const latencyDifference = Number(latencyUnderLoad) - Number(ping);

    const latencyRatio =
      Number(ping) > 0 ? Number(latencyUnderLoad) / Number(ping) : 0;

    const stabilityIndex =
      Number(download) / (Number(jitter) + 1);

    const congestionScore =
      Number(ping) > 0 ? latencyDifference / Number(ping) : 0;

    // ================= BUFFERBLOAT =================

    let bufferbloatGrade;

    if (latencyDifference <= 5) bufferbloatGrade = "A";
    else if (latencyDifference <= 20) bufferbloatGrade = "B";
    else if (latencyDifference <= 50) bufferbloatGrade = "C";
    else bufferbloatGrade = "D";

    // ================= DEBUG LOG =================

    const aiVariables = {
      connection,
      ping,
      jitter,
      download,
      upload,
      latencyUnderLoad,
      latencyDifference,
      latencyRatio,
      stabilityIndex,
      congestionScore,
      bufferbloatGrade,
      deviceCount: deviceCount || 0,
      wifiSignal: wifiSignal !== undefined ? wifiSignal : null
    };

    console.log("\n===== NETSCOPE AI INPUT =====");
    console.table(aiVariables);

    // ================= AI PROMPT =================

    const prompt = `نتائج فحص الشبكة:

نوع الاتصال: ${connection}
Ping: ${Number(ping).toFixed(1)} ms
Jitter: ${Number(jitter).toFixed(1)} ms
Download: ${Number(download).toFixed(1)} Mbps
Upload: ${Number(upload).toFixed(1)} Mbps
Latency Under Load: ${Number(latencyUnderLoad).toFixed(1)} ms
Bufferbloat Grade: ${bufferbloatGrade}
Latency Increase: ${latencyDifference.toFixed(1)} ms
Latency Ratio: ${latencyRatio.toFixed(2)}
Network Stability: ${stabilityIndex.toFixed(2)}
Congestion Score: ${congestionScore.toFixed(2)}
المسافة التقريبية بين المستخدم والبرج: ${Number(towerDistance).toFixed(2)} km
عدد الأجهزة المتصلة بالشبكة: ${deviceCount || 0}
قوة إشارة WiFi: ${wifiSignal !== null && wifiSignal !== undefined ? wifiSignal + '%' : 'غير متوفر'}


تحليل ذكي (مهم جداً):

قم بتحليل جودة الشبكة بشكل شامل بناءً على العلاقة بين جميع القيم.
لا تعتمد على حدود رقمية ثابتة أو قواعد جامدة.

بدلاً من ذلك:
- قارن القيم ببعضها
- لاحظ الفرق بين الأداء الطبيعي وتحت الضغط
- استخرج الأنماط غير الطبيعية

ركز على فهم الصورة الكاملة:

- هل الشبكة سريعة لكن تتدهور عند الاستخدام؟
- هل التأخير يرتفع بشكل ملحوظ تحت الضغط؟
- هل يوجد تذبذب في الأداء؟
- هل الأداء مستقر أو يتغير بشكل واضح؟

تحليل الاستقرار:
- قارن بين Ping و Latency Under Load
- أي فرق ملحوظ يدل على ضعف تحمل الشبكة للضغط

تحليل الضغط:
- اربط بين عدد الأجهزة وارتفاع التأخير أو Congestion Score
- إذا الأداء يسوء مع النشاط → يوجد ازدحام داخلي

تحليل WiFi:
- استخدم قوة الإشارة كعامل مساعد
- لا تعتبرها السبب الرئيسي إلا إذا كان تأثيرها واضح على الأداء

تحليل السرعة:
- لا تعتمد على السرعة فقط
- قد تكون السرعة عالية لكن التجربة سيئة بسبب التأخير أو التذبذب

تحليل عام:
- إذا المشكلة تظهر عند الاستخدام → غالباً ضغط داخلي
- إذا المشكلة ثابتة دائمًا → غالباً خارجية

اتخاذ القرار:
- اختر السبب الأكثر تأثيراً فقط كمشكلة رئيسية
- بقية العوامل ضعها كأسباب محتملة
- فكّر كمحلل شبكات وليس كمنفذ شروط


تحديد موقع المشكلة (Root Cause):

اختر موقعاً واحداً فقط هو الأكثر احتمالاً:

مزود الخدمة
السيرفر
المودم
الواي فاي
المسافة عن الراوتر
ضغط الشبكة
البرج
لا توجد مشكلة


خذ بعين الاعتبار نوع الاتصال:

إذا WiFi
ركز على التداخل بين الشبكات أو المسافة عن الراوتر أو ضغط الشبكة.

إذا Ethernet
استبعد مشاكل الإشارة وركز على مزود الخدمة أو السيرفر.

إذا Cellular
ركز على ازدحام البرج أو ضعف التغطية أو بعد المستخدم عن البرج.

تحسين دقة الحكم:

لا تبالغ في وصف المشكلة.

- إذا كانت القيم ضمن نطاق مقبول لكن فيها ملاحظة بسيطة → استخدم وصف متوسط وليس قوي
- لا تستخدم كلمات مثل "ارتفاع كبير" أو "مشكلة واضحة" إلا إذا كان التأثير فعلاً واضح
- فرّق بين:
  - مشكلة حقيقية
  - ملاحظة بسيطة

مثال:
- فرق بسيط في التأخير → "تأثير خفيف"
- فرق واضح → "ارتفاع ملحوظ"

اكتب النتيجة بهذا التنسيق فقط:


التقييم العام: (ممتاز / جيد جدا / متوسط / ضعيف)

المشكلة الرئيسية: (وصف مختصر للمشكلة)

الموقع المحتمل: (اختر خيار واحد فقط)

الأسباب المحتملة:
- سبب مختصر
- سبب مختصر
- سبب مختصر
- سبب مختصر

الحلول المقترحة:
- حل عملي واضح
- حل عملي واضح
- حل عملي واضح
- حل عملي واضح


الشروط:

لا تكتب أي نص خارج التنسيق المطلوب.
استخدم لغة عربية بسيطة يفهمها المستخدم العادي.
كل سطر يجب أن يكون مختصر وواضح.
لا تستخدم مصطلحات تقنية معقدة.
`;

    // ================= OPENAI =================

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 180,
    });

    const result = completion.choices[0].message.content;

    // ================= ISP CONTACT =================

    let contactISP = null;

    if (isp && ispContacts[isp]) {
      contactISP = {
        name: isp,
        phone: ispContacts[isp]
      };
    }

    const responsePayload = {
      analysis: result,
      contactISP,

      metrics: {
        ping,
        jitter,
        download,
        upload,
        latencyUnderLoad,
        latencyDifference,
        latencyRatio,
        stabilityIndex,
        congestionScore,
        bufferbloatGrade,
        towerDistance,
        deviceCount: deviceCount || 0,
        wifiSignal: wifiSignal !== undefined ? wifiSignal : null
      }
    };

    console.log("\n===== SERVER RESPONSE =====");
    console.log(responsePayload);

    res.json(responsePayload);

  } catch (err) {

    console.error("AI Error:", err);

    if (err.code === "insufficient_quota") {
      return res.json({
        analysis: "⚠️ خدمة الذكاء الاصطناعي غير متاحة حاليًا بسبب انتهاء الرصيد.",
      });
    }

    res.status(500).json({
      analysis: "حدث خطأ أثناء التحليل.",
    });
  }
});

// ================= KEEP ALIVE =================

app.use((req, res, next) => {
  res.set("Connection", "keep-alive");
  next();
});

// ================= NEAREST TOWER =================
// ================= NEAREST TOWER =================

function getDistance(lat1, lon1, lat2, lon2) {

  const R = 6371;

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

app.post("/api/nearest-tower", async (req, res) => {
  try {

    const lat = Number(req.body.lat);
    const lon = Number(req.body.lon);
    const isp = req.body.isp;

    if (!lat || !lon) {
      return res.json({ error: "Missing coordinates" });
    }

    const apiKey = process.env.OPENCELL_API_KEY;

    const operatorMap = {
      STC: 1,
      Mobily: 3,
      Zain: 4
    };

    const targetMNC = operatorMap[isp];

    // إنشاء BBOX حول المستخدم
    const offset = 0.005;

    const latMin = lat - offset;
    const latMax = lat + offset;
    const lonMin = lon - offset;
    const lonMax = lon + offset;

    const url = `https://opencellid.org/cell/getInArea?key=${apiKey}&BBOX=${latMin},${lonMin},${latMax},${lonMax}&format=json`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data || !data.cells) {
      return res.json({ error: "No towers found" });
    }

    // فلترة الأبراج حسب المشغل
    let towers = data.cells;

    if (targetMNC) {
      towers = data.cells.filter(tower => tower.mnc === targetMNC);

      console.log("Filtering towers for operator:", isp);
      console.log("Filtered towers:", towers.length);
    }

    let nearestTower = null;
    let minDistance = Infinity;

    towers.forEach(tower => {

      const distance = getDistance(
        lat,
        lon,
        tower.lat,
        tower.lon
      );

      if (distance < minDistance) {

        minDistance = distance;
        nearestTower = tower;

      }

    });

    res.json({
      nearestTower,
      distance: minDistance
    });

  } catch (err) {

    console.error("Tower API Error:", err);
    res.status(500).json({ error: "Tower lookup failed" });

  }
});

// ================= ISP LOOKUP =================

app.post("/api/isp", async (req, res) => {
  try {

    const { ip } = req.body;

    if (!ip) {
      return res.json({ error: "No IP provided" });
    }

    const response = await fetch(`https://ipinfo.io/${ip}/json`);
    const data = await response.json();

    function normalizeISPName(name) {

      if (!name) return null;

      const lower = name.toLowerCase();

      if (lower.includes("saudi telecom") || lower.includes("stc"))
        return "STC";

      if (lower.includes("mobily") || lower.includes("etihad"))
        return "Mobily";

      if (lower.includes("zain"))
        return "Zain";

      if (lower.includes("salem") || lower.includes("solutions"))
        return "STC Solutions";

      return name;
    }

    const cleanName = normalizeISPName(data.org);

    res.json({
      ip: data.ip,
      isp: cleanName,
      city: data.city,
      country: data.country
    });

  } catch (err) {

    console.error("ISP Lookup Error:", err);
    res.status(500).json({ error: "ISP lookup failed" });

  }
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});