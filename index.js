```javascript
const { Telegraf, Markup } = require('telegraf');

// Replace with your Telegram Bot Token
const bot = new Telegraf('8538468032:AAEQRgJ7uqnvXBijPHvPn292blBsh2ICE2E');

const products = [
  {
    id: "1",
    name: "Nitro Boost Monthly",
    price: 9.99,
    description: "Elevate your discord experience with high-quality audio and more perks.",
    category: "Digital",
    image: "https://picsum.photos/seed/nitro/200/200"
  },
  {
    id: "2",
    name: "Bot Source Code",
    price: 49,
    description: "Complete source code for this shop bot built with Node.js.",
    category: "Service",
    image: "https://picsum.photos/seed/code/200/200"
  }
];

// Start Command
bot.start((ctx) => {
  ctx.reply(
    "Welcome to the future of digital shopping! How can I help you today?",
    Markup.inlineKeyboard([
      [Markup.button.callback('Catalog', 'btn_catalog')],
      [Markup.button.callback('Support', 'btn_support'), Markup.button.callback('My Orders', 'btn_orders')]
    ])
  );
});

// Catalog Action
bot.action('btn_catalog', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('🛒 *AutoShop Prime Catalog*', { parse_mode: 'Markdown' });

    for (const product of products) {
      await ctx.replyWithPhoto(product.image, {
        caption: `*${product.name}*\n\n${product.description}\n\n💵 Price: $${product.price}\n📂 Category: ${product.category}`,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          Markup.button.callback('Buy Now', `buy_${product.id}`)
        ])
      });
    }
  } catch (error) {
    console.error('Catalog Error:', error);
    ctx.reply('Sorry, there was an issue loading the catalog.');
  }
});

// Support Action
bot.action('btn_support', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('👨‍💻 Support: Please contact @Admin for assistance.');
  } catch (error) {
    console.error(error);
  }
});

// My Orders Action
bot.action('btn_orders', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('📂 You currently have no active orders.');
  } catch (error) {
    console.error(error);
  }
});

// Buy Now Action Handler
bot.action(/^buy_(.+)$/, async (ctx) => {
  try {
    const productId = ctx.match[1];
    const product = products.find(p => p.id === productId);

    if (product) {
      await ctx.answerCbQuery(`Selected: ${product.name}`);
      await ctx.reply(
        `✅ *Initiating Checkout*\n\nProduct: ${product.name}\nTotal: $${product.price}\n\nPlease proceed with payment provider...`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.answerCbQuery('Product not found.');
    }
  } catch (error) {
    console.error('Buy Action Error:', error);
    ctx.reply('An error occurred processing your request.');
  }
});

// Global Error Handling
bot.catch((err, ctx) => {
  console.log(`Ooops, encountered an error for ${ctx.updateType}`, err);
});

// Launch Bot
bot.launch().then(() => {
    console.log('AutoShop Prime is running...');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
```
