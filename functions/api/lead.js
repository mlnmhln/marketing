// Cloudflare Pages Function — POST /api/lead
// Принимает заявку с сайта и отправляет её в Telegram-группу через Bot API.
// Секреты НЕ хранятся в коде — они берутся из переменных окружения Cloudflare:
//   BOT_TOKEN — токен Telegram-бота
//   CHAT_ID   — id группы/чата, куда слать заявки
// Эти переменные задаются в Cloudflare Pages → Settings → Variables and secrets.

function corsHeaders() {
  // Запросы идут с того же домена (same-origin), CORS по сути не нужен,
  // но разрешаем всем без cookie — это безопасно (учётные данные не используются)
  // и не мешает пользователям с VPN.
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, corsHeaders()),
  });
}

function esc(s) {
  // экранирование под HTML parse_mode Telegram
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Префлайт CORS
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// Основной обработчик — только POST
export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try {
    data = await request.json();
  } catch (e) {
    return json({ success: false, error: "Некорректные данные" }, 400);
  }
  if (!data || typeof data !== "object") {
    return json({ success: false, error: "Некорректные данные" }, 400);
  }

  // --- honeypot: если скрытое поле website заполнено — это бот ---
  // Возвращаем success:true, чтобы спам-бот не понял, что его поймали.
  if (data.website && String(data.website).trim() !== "") {
    return json({ success: true }, 200);
  }

  // --- нормализация полей ---
  const name = (data.name || "").toString().trim();
  const contact = (data.contact || "").toString().trim(); // "Telegram или телефон" из основной формы
  const phone = (data.phone || "").toString().trim();
  const tg = (data.tg || "").toString().trim();
  const email = (data.email || "").toString().trim();

  // --- валидация: имя обязательно ---
  if (!name) {
    return json({ success: false, error: "Укажите имя" }, 400);
  }
  // --- хотя бы один контакт обязателен (контакт / телефон / телеграм / email) ---
  if (!contact && !phone && !tg && !email) {
    return json({ success: false, error: "Укажите контакт для связи" }, 400);
  }
  // --- если есть email — базовая проверка ---
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ success: false, error: "Некорректный email" }, 400);
  }

  // --- секреты только из окружения ---
  const token = env.BOT_TOKEN;
  const chatId = env.CHAT_ID;
  if (!token || !chatId) {
    return json({ success: false, error: "Сервис временно недоступен" }, 500);
  }

  // --- формируем аккуратное сообщение ---
  const L = [];
  L.push("🆕 <b>Новая заявка с сайта</b>");
  if (data.source) L.push("📍 Источник: " + esc(data.source));
  L.push("");
  L.push("👤 Имя: " + esc(name));
  if (contact) L.push("📞 Контакт: " + esc(contact));
  if (phone) L.push("📞 Телефон: " + esc(phone));
  if (tg) L.push("✈️ Telegram: " + esc(tg));
  if (email) L.push("✉️ Email: " + esc(email));
  if (data.company) L.push("🏢 Компания: " + esc(data.company));
  if (data.city) L.push("🌍 Город: " + esc(data.city));
  if (data.service) L.push("🛠 Услуга: " + esc(data.service));
  if (data.budget) L.push("💰 Бюджет: " + esc(data.budget));
  if (data.link) L.push("🔗 Сайт/соцсети: " + esc(data.link));
  if (data.business) L.push("🧩 О бизнесе: " + esc(data.business));
  if (data.goal) L.push("🎯 Задача: " + esc(data.goal));
  if (data.comment) L.push("💬 Комментарий: " + esc(data.comment));

  const text = L.join("\n");

  // --- отправка в Telegram ---
  try {
    const resp = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!resp.ok) {
      return json({ success: false, error: "Не удалось отправить заявку" }, 502);
    }
    const result = await resp.json().catch(() => null);
    if (!result || !result.ok) {
      return json({ success: false, error: "Не удалось отправить заявку" }, 502);
    }
  } catch (e) {
    return json({ success: false, error: "Не удалось отправить заявку" }, 502);
  }

  return json({ success: true }, 200);
}
