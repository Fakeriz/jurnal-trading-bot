//CONFIG
var BOT_TOKEN = "YOUR_BOT_TOKEN_HERE" //BOT TOKEN ANDA
var SS_URL = "YOUR_GOOGLE_SHEET_URL_HERE" //URL SPREADSHEET
var TRADES_SHEET_NAME = "Trades" //NAMA SHEET TRADES
var PERFORMANCE_SHEET_NAME = "Performance" //NAMA SHEET PERFORMANCE

//BEGIN
const ss = SpreadsheetApp.openByUrl(SS_URL);
const tradesSheet = ss.getSheetByName(TRADES_SHEET_NAME);
const performanceSheet = ss.getSheetByName(PERFORMANCE_SHEET_NAME);
const Trades = new Collection.Collect(tradesSheet)
const Performance = new Collection.Collect(performanceSheet)

function doGet(e) {
  return HtmlService.createHtmlOutput('<h1>Trading Journal Bot Active</h1>')
}

function doPost(e) {
  const queryParameters = e.parameter;
  const usersQuery = queryParameters.users
  const validUsers = usersQuery.split(',')
  try {
    if (e.postData.type == "application/json") {
      let update = JSON.parse(e.postData.contents);
      if (update) {
        commands(update, validUsers)
        return true
      }
    }
  } catch (e) {
    Logger.log(e)
  }
}

function commands(update, validUsers) {
  const chatId = update.message.chat.id;
  const first_name = update.message.chat.first_name;
  const text = update.message.text || '';
  const timestamp = new Date().toLocaleString();
  const _date = new Date().toJSON()

  if (validUsers.includes(String(chatId))) {
    if (text.startsWith("/start")) {
      sendMessage({
        chat_id: chatId,
        text: "Welcome to your Trading Journal Bot.\n\nCommands:\n/trade [symbol] [direction] [entry] [exit] [size] [pnl] [notes]\n/performance [timeframe]\n/stats\n/help"
      })
    } else if (text.startsWith("/trade")) {
      const stext = text.split(' ')
      stext.splice(0, 1);
      
      if (stext.length >= 6) {
        const [symbol, direction, entry, exit, size, pnl, ...notes] = stext;
        
        Trades.insert({
          _date,
          Timestamp: timestamp,
          Symbol: symbol.toUpperCase(),
          Direction: direction.toLowerCase(),
          Entry: parseFloat(entry),
          Exit: parseFloat(exit),
          Size: parseFloat(size),
          PNL: parseFloat(pnl),
          Notes: notes.join(' '),
          TraderID: chatId,
          TraderName: first_name
        })

        updatePerformance(chatId, parseFloat(pnl))

        sendMessage({
          chat_id: chatId,
          text: 'Trade logged successfully.'
        })
      } else {
        sendMessage({
          chat_id: chatId,
          text: 'Invalid format. Use: /trade [symbol] [direction] [entry] [exit] [size] [pnl] [notes]'
        })
      }
    } else if (text.startsWith("/performance")) {
      const stext = text.split(' ')
      const timeframe = stext[1] || 'all'
      
      const performance = getPerformance(chatId, timeframe)
      
      sendMessage({
        chat_id: chatId,
        text: `Performance (${timeframe}):\n${performance}`
      })
    } else if (text.startsWith("/stats")) {
      const stats = getTradeStats(chatId)
      
      sendMessage({
        chat_id: chatId,
        text: `Trading Statistics:\n${stats}`
      })
    } else if (text.startsWith("/help")) {
      sendMessage({
        chat_id: chatId,
        text: "Trading Journal Bot Commands:\n\n" +
              "/trade [symbol] [direction] [entry] [exit] [size] [pnl] [notes] - Log a trade\n" +
              "/performance [timeframe] - View performance (daily, weekly, monthly, yearly, all)\n" +
              "/stats - View overall trading statistics\n" +
              "/help - Show this help message"
      })
    }
  }
}

function updatePerformance(traderId, pnl) {
  const today = new Date().toJSON().slice(0, 10);
  const existingPerformance = Performance.findOne({ TraderID: traderId, Date: today });

  if (existingPerformance) {
    Performance.update(
      { TraderID: traderId, Date: today },
      { $inc: { DailyPNL: pnl } }
    )
  } else {
    Performance.insert({
      TraderID: traderId,
      Date: today,
      DailyPNL: pnl
    })
  }
}

function getPerformance(traderId, timeframe) {
  const now = new Date();
  let startDate;

  switch (timeframe) {
    case 'daily':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'weekly':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      break;
    case 'monthly':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'yearly':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(0); // All time
  }

  const performances = Performance.find({
    TraderID: traderId,
    Date: d => new Date(d) >= startDate && new Date(d) <= now
  });

  const totalPNL = performances.reduce((sum, perf) => sum + perf.DailyPNL, 0);
  const avgPNL = totalPNL / performances.length || 0;

  return `Total P&L: $${totalPNL.toFixed(2)}\nAverage Daily P&L: $${avgPNL.toFixed(2)}`;
}

function getTradeStats(traderId) {
  const trades = Trades.find({ TraderID: traderId });

  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => t.PNL > 0).length;
  const losingTrades = trades.filter(t => t.PNL < 0).length;
  const winRate = (winningTrades / totalTrades * 100).toFixed(2);
  
  const totalPNL = trades.reduce((sum, trade) => sum + trade.PNL, 0);
  const avgPNL = totalPNL / totalTrades || 0;

  const profitFactor = trades.reduce((pf, trade) => {
    pf.profit += trade.PNL > 0 ? trade.PNL : 0;
    pf.loss += trade.PNL < 0 ? Math.abs(trade.PNL) : 0;
    return pf;
  }, { profit: 0, loss: 0 });

  return `Total Trades: ${totalTrades}\n` +
         `Winning Trades: ${winningTrades}\n` +
         `Losing Trades: ${losingTrades}\n` +
         `Win Rate: ${winRate}%\n` +
         `Total P&L: $${totalPNL.toFixed(2)}\n` +
         `Average P&L per Trade: $${avgPNL.toFixed(2)}\n` +
         `Profit Factor: ${(profitFactor.profit / profitFactor.loss).toFixed(2)}`;
}

function sendMessage(postdata) {
  var options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(postdata),
    'muteHttpExceptions': true
  };
  UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', options);
}
