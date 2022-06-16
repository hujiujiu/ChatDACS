"use strict";
/**
 * Author: Giftina: https://github.com/Giftia/
 * 沙雕Ai聊天系统 ChatDACS (Chatbot : shaDiao Ai Chat System)，一个简单的机器人框架，支持接入哔哩哔哩直播，具备完全功能的web网页控制台。
 */

/**
 * 启动时中文路径检查
 */
const ChildProcess = require("child_process");
const _cn_reg = new RegExp("[\u4e00-\u9fa5]");
if (_cn_reg.test(process.cwd())) {
  const warnMessage = `因为Unicode的兼容性问题，程序所在路劲不能有汉字日语韩语表情包之类的奇奇怪怪的字符，请使用常规的ASCII字符!如有疑问，请加QQ群 120243247 咨询。当前路径含有不对劲的字符: ${process.cwd()}`;
  console.log(warnMessage);
  ChildProcess.exec(`msg %username% ${warnMessage}`);
}

/**
 * 声明依赖与配置
 */
const versionNumber = "v3.5.5-dev"; //版本号
const version = `ChatDACS ${versionNumber}`; //系统版本，会显示在web端标题栏
const utils = require("./plugins/system/utils.js"); //载入系统通用模块
const Constants = require("./config/constants.js"); //系统常量
const compression = require("compression"); //用于gzip压缩
const express = require("express"); //轻巧的express框架
const app = require("express")();
app.use(compression()); //对express所有路由启用gzip
app.use(express.static("static")); //静态文件引入
app.use(express.json()); //解析post
app.use(express.urlencoded({ extended: false })); //解析post
const multer = require("multer"); //用于文件上传
const upload = multer({ dest: "./static/uploads/" }); //用户上传目录
const cookie = require("cookie");
const http = require("http").Server(app);
const io = require("socket.io")(http);
const request = require("request");
const axios = require("axios").default;
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db.db"); //数据库位置，默认与index.js同目录
const colors = require("colors"); //Console日志染色颜色配置
colors.setTheme({
  alert: "inverse",
  on: "brightMagenta",
  off: "gray",
  warn: "brightYellow",
  error: "brightRed",
  log: "brightBlue",
});
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas"); //用于绘制文字图像，迫害p图
require.all = require("require.all"); //插件加载器
const { KeepLiveTCP } = require("bilibili-live-ws");
const yaml = require("yaml"); //使用yaml解析配置文件
const voicePlayer = require("play-sound")({
  player: path.join(process.cwd(), "plugins", "mpg123", "mpg123.exe"),
}); //mp3静默播放工具，用于直播时播放语音
const ipTranslator = require("lib-qqwry")(true); //lib-qqwry是一个高效纯真IP库(qqwry.dat)引擎，传参 true 是将IP库文件读入内存中以提升效率
const { createOpenAPI, createWebsocket } = require("qq-guild-bot"); //QQ频道SDK

/**
 * 中文分词器
 */
const jieba = require("nodejieba");
jieba.load({
  dict: path.join(process.cwd(), "config", "jieba.dict.utf8"),
  hmmDict: path.join(process.cwd(), "config", "hmm_model.utf8"),
  userDict: path.join(process.cwd(), "config", "userDict.txt"), //加载自定义分词库
  idfDict: path.join(process.cwd(), "config", "idf.utf8"),
  stopWordDict: path.join(process.cwd(), "config", "stopWordDict.txt"), //加载分词库黑名单
});

/**
 * 配置输入器
 */
const readline = require("readline");
const readLine = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * 本地日志配置
 */
const winston = require("winston");
const { format, transports } = require("winston");
const { printf } = format;

const myFormat = printf(({ level, message, timestamp }) => {
  return `[${level}] [${timestamp}]: ${message}`;
});

winston.addColors(Constants.LOG_LEVELS.colors);

const logger = winston.createLogger({
  levels: Constants.LOG_LEVELS.levels,
  format: winston.format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
    format.errors({ stack: true }),
    format.json(),
  ),
  transports: [
    new transports.Console({
      format: winston.format.combine(winston.format.colorize(), myFormat),
    }),
    new transports.Http({
      level: "warn",
    }),
    new winston.transports.File({
      filename: "error.log",
      level: "error",
    }),
    new winston.transports.File({
      filename: "combined.log",
    }),
  ],
});

/**
 * 错误捕获
 */
process.on("uncaughtException", (err) => {
  io.emit("system", `@未捕获的异常: ${err}`);
  logger.error(err);
});

process.on("unhandledRejection", (err) => {
  io.emit("system", `@未捕获的promise异常: ${err}`);
  logger.error(err);
});

/**
 * 系统配置和开关，以及固定变量
 */
var boomTimer; //60s计时器
var onlineUsers = 0, //预定义
  QQBOT_QQ,
  QQBOT_ADMIN_LIST,
  QQ_GROUP_WELCOME_MESSAGE,
  BILIBILI_LIVE_ROOM_ID,
  CHAT_SWITCH,
  CONNECT_GO_CQHTTP_SWITCH,
  CONNECT_BILIBILI_LIVE_SWITCH,
  WEB_PORT,
  GO_CQHTTP_SERVICE_ANTI_POST_API,
  GO_CQHTTP_SERVICE_API_URL,
  CHAT_JIEBA_LIMIT,
  QQBOT_REPLY_PROBABILITY,
  QQBOT_FUDU_PROBABILITY,
  QQBOT_SAVE_ALL_IMAGE_TO_LOCAL_SWITCH,
  QQBOT_MAX_MINE_AT_MOST,
  xiaoye_ated,
  QQBOT_PRIVATE_CHAT_SWITCH,
  AUTO_APPROVE_QQ_FRIEND_REQUEST_SWITCH,
  c1c_count = 0,
  CONNECT_QQ_GUILD_SWITCH,
  QQ_GUILD_APP_ID,
  QQ_GUILD_TOKEN;

/**
 * 声明结束，开始初始化
 */
logger.info("开始加载插件……".log);
const plugins = require.all({
  dir: path.join(process.cwd(), "plugins"),
  match: /\.js$/,
  require: /\.js$/,
  recursive: false,
  encoding: "utf-8",
  resolve: function (plugins) {
    plugins.all.load();
  },
});
console.log(plugins);
logger.info("插件加载完毕√\n".log);

InitConfig();

/**
 * 下面是三大核心功能: web端、qq端、直播间端
 */

/**
 * web端，前端使用layim框架
 */
io.on("connection", (socket) => {
  socket.emit("getCookie");
  const CID = cookie.parse(socket.request.headers.cookie || "").ChatdacsID;
  if (CID === undefined) {
    socket.emit("getCookie");
    return 0;
  }

  //获取 ip 与 地理位置
  const ip = socket.handshake.headers["x-forwarded-for"] ? socket.handshake.headers["x-forwarded-for"]?.split("::ffff:")[1] : socket.handshake.address.split("::ffff:")[1] ?? socket.handshake.address;
  let location = "未知归属地";
  try {
    location = ipTranslator.searchIP(ip).Country;
  } catch (error) {
    logger.error(`获取地理位置失败: ${error}`);
  }

  socket.emit("version", version);
  io.emit("onlineUsers", ++onlineUsers);

  //开始获取用户信息并处理
  utils
    .GetUserData(CID)
    .then(([nickname, loginTimes, lastLoginTime]) => {
      socket.username = `${nickname}[来自${location}]`;

      logger.info(
        `web端用户 ${nickname}(${CID}) 已经连接，登录次数 ${loginTimes}，上次登录时间 ${lastLoginTime}`.log,
      );

      //更新登录次数
      db.run(
        `UPDATE users SET logintimes = logintimes + 1 WHERE CID ='${CID}'`,
      );

      //更新最后登陆时间
      db.run(
        `UPDATE users SET lastlogintime = '${utils.GetTimes().YearMonthDay}${utils.GetTimes().Clock}' WHERE CID ='${CID}'`,
      );

      io.emit(
        "system",
        `@欢迎回来，${socket.username}(${CID}) 。这是你第${loginTimes}次访问。上次访问时间: ${lastLoginTime}`,
      );
    })
    //若无法获取该用户信息，则应该是其第一次访问，接下来是新增用户操作:
    .catch(async (_reject) => {
      const CID = cookie.parse(socket.request.headers.cookie || "").ChatdacsID;
      const randomNickname = await utils.RandomNickname();
      socket.username = `${randomNickname}[来自${location}]`;

      logger.info(
        `web端用户 ${socket.username}(${CID}) 第一次访问，新增该用户`.log,
      );

      db.run(
        `INSERT INTO users VALUES('${randomNickname}', '${CID}', '2', '${utils.GetTimes().YearMonthDay}${utils.GetTimes().Clock}')`,
      );

      io.emit(
        "system",
        `@新用户 ${socket.username}(${CID}) 已连接。小夜帮你取了一个随机昵称: ${socket.username}，请前往 更多-设置 来更改昵称`,
      );
      socket.emit("message", {
        CID: "0",
        msg: Constants.HELP_CONTENT,
      });
    });

  socket.on("disconnect", () => {
    onlineUsers--;
    io.emit("onlineUsers", onlineUsers);
    logger.info(
      `web端用户 ${socket.username}(${CID}) 已经断开连接`.log,
    );
    io.emit("system", "@用户 " + socket.username + " 已断开连接");
  });

  socket.on("typing", () => {
    io.emit("typing", `${socket.username} 正在输入...`);
  });

  socket.on("typingOver", () => {
    io.emit("typing", "");
  });

  //用户设置
  socket.on("getSettings", () => {
    const CID = cookie.parse(socket.request.headers.cookie || "").ChatdacsID;
    socket.emit("settings", { CID: CID, name: socket.username });
  });

  //web端最核心代码，聊天处理
  socket.on("message", async (msgIn) => {
    const CID =
      cookie.parse(socket.request.headers.cookie || "").ChatdacsID ?? 0;
    const msg = msgIn.msg.replace(/['<>]/g, ""); //防爆
    logger.info(
      `web端用户 ${socket.username}(${CID}) 发送了消息: ${msg}`.warn,
    );
    db.run(
      `INSERT INTO messages VALUES('${utils.GetTimes().YearMonthDay}', '${utils.GetTimes().Clock}}', '${CID}', '${msg}')`,
    );
    io.emit("message", { CID: CID, name: socket.username, msg: msg }); //用户广播

    //web端插件应答器
    const pluginsReply = await ProcessExecute(msg, CID, socket.username) ?? "";
    if (pluginsReply) {
      const replyToWeb = utils.PluginAnswerToWebStyle(pluginsReply);
      const answerMessage = {
        CID: "0",
        msg: replyToWeb,
      };
      io.emit("message", answerMessage);
    }

    if (CHAT_SWITCH) {
      //交给聊天函数处理
      const chatReply = await ChatProcess(msg);
      if (chatReply) {
        io.emit("message", { CID: "0", msg: chatReply });
      }
    }
  });
});

/**
 * 小夜核心代码，对接go-cqhttp
 */
function StartQQBot() {
  app.post(GO_CQHTTP_SERVICE_ANTI_POST_API, async (req, res) => {
    const event = req.body;

    //处理频道消息
    if (event.message_type == "guild") {
      logger.info(`小夜收到频道 ${event.channel_id} 的 ${event.user_id} (${event.sender.nickname}) 发来的消息: ${event.message}`);
      await ProcessGuildMessage(event);
      return 0;
    }

    //被禁言1小时以上自动退群
    if (event.sub_type == "ban" && event.user_id == (event.message?.self_id ?? QQBOT_QQ)) {
      if (event.duration >= 3599) {
        request(
          `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_leave?group_id=${event.group_id}`,
          function (error, _response, _body) {
            if (!error) {
              logger.info(
                `小夜在群 ${event.group_id} 被禁言超过1小时，自动退群`.error,
              );
              io.emit(
                "system",
                `@小夜在群 ${event.group_id} 被禁言超过1小时，自动退群`,
              );
            }
          },
        );
      } else {
        //被禁言改名
        request(
          `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_card?group_id=${event.group_id}&user_id=${event.message?.self_id ?? QQBOT_QQ}&card=${encodeURI("你妈的，为什么 禁言我")}`,
          function (error, _response, _body) {
            if (!error) {
              logger.info(
                `小夜在群 ${event.group_id} 被禁言，自动改名为 你妈的，为什么 禁言我`.log,
              );
            }
          },
        );
      }
      res.send();
      return 0;
    }

    //添加好友请求
    if (event.request_type == "friend") {
      logger.info(
        `小夜收到好友请求，请求人：${event.user_id}，请求内容：${event.comment}，按配置自动处理`.log,
      );
      res.send({ approve: AUTO_APPROVE_QQ_FRIEND_REQUEST_SWITCH });
      return 0;
    }

    //加群请求发送给管理员
    if (event.request_type == "group" && event.sub_type == "invite") {
      const msg = `用户 ${event.user_id} 邀请小夜加入群 ${event.group_id}，批准请发送
/批准 ${event.flag}`;
      logger.info(
        `小夜收到加群请求，请求人：${event.user_id}，请求内容：${event.comment}，发送小夜管理员审核`.log,
      );
      request(
        `http://${GO_CQHTTP_SERVICE_API_URL}/send_private_msg?user_id=${QQBOT_ADMIN_LIST[0]}&message=${encodeURI(msg)}`,
      );
      //发送给邀请者批准提醒
      const inviteReplyContent = `你好呀，感谢你的使用，邀请小夜加入你的群后，请联系这只小夜的主人 ${QQBOT_ADMIN_LIST[0]} 来批准入群邀请噢`;
      request(
        `http://${GO_CQHTTP_SERVICE_API_URL}/send_private_msg?user_id=${event.user_id}&message=${encodeURI(inviteReplyContent)}`,
      );
      res.send({});
      return 0;
    }

    //管理员批准群邀请
    if (
      event.message_type == "private" &&
      event.user_id == QQBOT_ADMIN_LIST[0] &&
      Constants.approve_group_invite_reg.test(event.message)
    ) {
      const flag = event.message.match(Constants.approve_group_invite_reg)[1];
      request(
        `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_add_request?flag=${encodeURI(
          flag,
        )}&type=invite&approve=1`,
        function (error, _response, _body) {
          if (!error) {
            logger.info(
              `管理员批准了群邀请请求 ${flag}`.log,
            );
            res.send({ reply: "已批准" });
          }
        },
      );
      return 0;
    }

    //————————————————————下面是功能————————————————————
    let notify;
    switch (event.sub_type) {
      case "friend":
      case "group":
        notify = `小夜收到好友 ${event.user_id} (${event.sender.nickname}) 发来的消息: ${event.message}`;
        break;
      case "normal":
        notify = `小夜收到群 ${event.group_id} 的 ${event.user_id} (${event.sender.nickname}) 发来的消息: ${event.message}`;
        break;
      case "approve":
        notify = `${event.user_id} 加入了群 ${event.group_id}`.log;
        break;
      case "ban":
        notify =
          `${event.user_id} 在群 ${event.group_id} 被禁言 ${event.duration} 秒`.error;
        break;
      case "poke":
        notify = `${event.user_id} 戳了一下 ${event.target_id}`.log;
        break;
      default:
        res.send();
        return 0;
    }
    logger.info(notify);
    io.emit("system", `@${notify}`);

    //转发图片到web端，按需启用
    if (QQBOT_SAVE_ALL_IMAGE_TO_LOCAL_SWITCH) {
      if (Constants.isImage_reg.test(event.message)) {
        const url = Constants.img_url_reg.exec(event.message);
        utils.SaveQQimg(url)
          .then((resolve) => {
            io.emit("qqImage", resolve);
          })
          .catch((reject) => {
            logger.error(`转发图片失败：${reject}`.error);
          });
        res.send();
        return 0;
      }
    }

    //转发视频到web端
    if (Constants.isVideo_reg.test(event.message)) {
      const url = Constants.video_url_reg.exec(event.message)[0];
      io.emit("qqVideo", { file: url, filename: "qq视频" });
      res.send();
      return 0;
    }

    //群服务开关判断
    const subTypeCondition = ["ban", "poke", "friend_add"];
    if (
      event.message_type == "group" ||
      event.notice_type == "group_increase" ||
      subTypeCondition.includes(event.sub_type)
    ) {
      //服务启用开关
      //指定小夜的话
      if (
        Constants.open_ju_reg.test(event.message) &&
        Constants.has_qq_reg.test(event.message)
      ) {
        const who = Constants.has_qq_reg.exec(event.message)[1];
        if (Constants.is_qq_reg.test(who)) {
          //如果是自己要被张菊，那么张菊
          if ((event.message?.self_id ?? QQBOT_QQ) == who) {
            request(
              `http://${GO_CQHTTP_SERVICE_API_URL}/get_group_member_info?group_id=${event.group_id}&user_id=${event.user_id}`,
              function (_error, _response, body) {
                body = JSON.parse(body);
                if (body.data.role === "owner" || body.data.role === "admin") {
                  logger.info(
                    `群 ${event.group_id} 启用了小夜服务`.log
                  );
                  db.run(
                    `UPDATE qq_group SET talk_enabled = '1' WHERE group_id ='${event.group_id}'`,
                  );
                  res.send({
                    reply:
                      "小夜的菊花被管理员张开了，这只小夜在本群的所有服务已经启用，要停用请发 闭菊",
                  });
                  return 0;
                  //不是管理，再看看是不是qqBot管理员
                } else {
                  for (let i in QQBOT_ADMIN_LIST) {
                    if (event.user_id == QQBOT_ADMIN_LIST[i]) {
                      logger.info(`群 ${event.group_id} 启用了小夜服务`.log);
                      db.run(
                        `UPDATE qq_group SET talk_enabled = '1' WHERE group_id ='${event.group_id}'`,
                      );
                      res.send({
                        reply:
                          "小夜的菊花被主人张开了，这只小夜在本群的所有服务已经启用，要停用请发 闭菊",
                      });
                      return 0;
                    }
                  }
                  //看来真不是管理员呢
                  res.send({
                    reply:
                      "你不是群管理呢，小夜不张，张菊需要让管理员来帮忙张噢",
                  });
                  return 0;
                }
              },
            );
            return 0;
            //不是这只小夜被张菊的话，嘲讽那只小夜
          } else {
            res.send({ reply: `[CQ:at,qq=${who}] 说你呢，快张菊!` });
            return 0;
          }
        }
      }
      //在收到群消息的时候搜索群是否存在于qq_group表，判断聊天开关
      else {
        db.all(
          `SELECT * FROM qq_group WHERE group_id = '${event.group_id}'`,
          async (err, sql) => {
            if (!err && sql[0]) {
              //群存在于qq_group表则判断聊天开关 talk_enabled，闭嘴了就无视掉所有消息
              if (sql[0].talk_enabled === 0) {
                logger.info(
                  `群 ${event.group_id} 服务已停用，无视群所有消息`.error,
                );
                res.send();
                return 0;
              } else {
                //服务启用了，允许进入后续的指令系统

                /**
                 * 群指令系统
                 */

                //群欢迎
                if (event.notice_type === "group_increase") {
                  const welcomeMessage = QQ_GROUP_WELCOME_MESSAGE.replace(/\[@新人\]/g, `[CQ:at,qq=${event.user_id}]`);
                  request(
                    `http://${GO_CQHTTP_SERVICE_API_URL}/send_group_msg?group_id=${event.group_id
                    }&message=${encodeURI(welcomeMessage)}`,
                    function (error, _response, _body) {
                      if (!error) {
                        logger.info(
                          `${event.user_id} 加入了群 ${event.group_id}，小夜欢迎了ta`.log,
                        );
                      }
                    },
                  );
                  return 0;
                }

                //地雷爆炸判断，先判断这条消息是否引爆，再从数据库取来群地雷数组，引爆后删除地雷，原先的地雷是用随机数生成被炸前最大回复作为引信，现在换一种思路，用更简单的随机数引爆
                let boom_flag = Math.floor(Math.random() * 100); //踩中flag
                //如果判定踩中，检查该群是否有雷
                if (boom_flag < 10) {
                  db.all(
                    `SELECT * FROM mine WHERE group_id = '${event.group_id}'`,
                    (err, sql) => {
                      if (!err && sql[0]) {
                        //有则判断是否哑雷
                        let unboom = Math.floor(Math.random() * 100); //是否哑雷
                        if (unboom < 30) {
                          //是哑雷，直接删除地雷
                          logger.info(
                            `${sql[0].placed_qq} 在群 ${sql[0].group_id} 埋的地雷被踩中，但这是一颗哑雷`.log,
                          );
                          db.run(
                            `DELETE FROM mine WHERE mine_id = '${sql[0].mine_id}' `,
                          );
                          res.send({
                            reply: `[CQ:at,qq=${event.user_id}]恭喜你躲过一劫，[CQ:at,qq=${sql[0].placed_qq}]埋的地雷掺了沙子，是哑雷，炸了，但没有完全炸`,
                          });
                          //成功引爆并删除地雷
                        } else {
                          let holly_hand_grenade = Math.floor(
                            Math.random() * 1000,
                          ); //丢一个骰子，判断地雷是否变成神圣地雷
                          if (holly_hand_grenade < 10) {
                            //运营方暗调了出率，10‰几率变成神圣地雷
                            request(
                              `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_whole_ban?group_id=${event.group_id}&enable=1`,
                              function (error, _response, _body) {
                                if (!error) {
                                  logger.info(
                                    `${sql[0].placed_qq} 在群 ${sql[0].group_id} 触发了神圣地雷`.error,
                                  );
                                  res.send({
                                    reply: "噢，该死，我的上帝啊，真是不敢相信，瞧瞧我发现了什么，我发誓我没有看错，这竟然是一颗出现率为千分之一的神圣地雷!我是说，这是一颗毁天灭地的神圣地雷啊!哈利路亚!麻烦管理员解除一下",
                                  });
                                }
                              },
                            );
                            return 0;
                          } else {
                            let boom_time = Math.floor(Math.random() * 60 * 2); //造成伤害时间
                            logger.info(
                              `${sql[0].placed_qq} 在群 ${sql[0].group_id} 埋的地雷被引爆，伤害时间${boom_time}秒`.log,
                            );
                            db.run(
                              `DELETE FROM mine WHERE mine_id = '${sql[0].mine_id}' `,
                            );
                            res.send({
                              reply: `[CQ:at,qq=${event.user_id}]恭喜你，被[CQ:at,qq=${sql[0].placed_qq}]所埋地雷炸伤，休养生息${boom_time}秒!`,
                              ban: 1,
                              ban_duration: boom_time,
                            });
                            return 0;
                          }
                        }
                      }
                    },
                  );
                  return 0;
                }

                //服务停用开关
                //指定小夜的话
                if (
                  Constants.close_ju_reg.test(event.message) &&
                  Constants.has_qq_reg.test(event.message)
                ) {
                  const who = Constants.has_qq_reg.exec(event.message)[1];
                  if (Constants.is_qq_reg.test(who)) {
                    //如果是自己要被闭菊，那么闭菊
                    if ((event.message?.self_id ?? QQBOT_QQ) == who) {
                      logger.error(
                        `群 ${event.group_id} 停止了小夜服务`.error,
                      );
                      db.run(
                        `UPDATE qq_group SET talk_enabled = '0' WHERE group_id ='${event.group_id}'`,
                      );
                      res.send({
                        reply: `小夜的菊花闭上了，这只小夜在本群的所有服务已经停用，取消请发 张菊[CQ:at,qq=${event.message?.self_id ?? QQBOT_QQ}]`,
                      });
                      return 0;
                      //不是这只小夜被闭菊的话，嘲讽那只小夜
                    } else {
                      res.send({ reply: `[CQ:at,qq=${who}] 说你呢，快闭菊!` });
                      return 0;
                    }
                  }
                  //没指定小夜
                } else if (event.message === "闭菊") {
                  logger.error(
                    `群 ${event.group_id} 停止了小夜服务`.error
                  );
                  db.run(
                    `UPDATE qq_group SET talk_enabled = '0' WHERE group_id ='${event.group_id}'`,
                  );
                  res.send({
                    reply: `小夜的菊花闭上了，小夜在本群的所有服务已经停用，取消请发 张菊[CQ:at,qq=${event.message?.self_id ?? QQBOT_QQ}]`,
                  });
                  return 0;
                }

                //qq端插件应答器
                const pluginsReply = await ProcessExecute(
                  event.message,
                  event.user_id,
                  event?.sender?.nickname,
                  event.group_id,
                  "", //群名暂时还没加
                  {
                    selfId: event.message?.self_id,
                    targetId: event.sub_type == "poke" ? event.target_id : null,
                  }
                );
                if (pluginsReply != "") {
                  const replyToQQ = utils.PluginAnswerToGoCqhttpStyle(pluginsReply);
                  request(
                    `http://${GO_CQHTTP_SERVICE_API_URL}/send_group_msg?group_id=${event.group_id}&message=${encodeURI(
                      replyToQQ,
                    )}`);
                }

                //戳一戳
                if (
                  event.sub_type === "poke" &&
                  event.target_id == (event?.self_id ?? QQBOT_QQ)
                ) {
                  logger.info("小夜被戳了".log);
                  c1c_count++;

                  if (c1c_count > 2) {
                    c1c_count = 0;
                    const final = "哎呀戳坏了，不理你了 ٩(๑`^`๑)۶";
                    request(
                      `http://${GO_CQHTTP_SERVICE_API_URL}/send_group_msg?group_id=${event.group_id
                      }&message=${encodeURI(final)}`,
                      function (error, _response, _body) {
                        if (!error) {
                          request(
                            `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_ban?group_id=${event.group_id}&user_id=${event.user_id}&duration=10`,
                            function (error, _response, _body) {
                              if (!error) {
                                logger.info(
                                  `小夜戳坏了，${event.user_id} 被禁言10s`.error,
                                );
                              }
                            },
                          );
                        }
                      },
                    );
                  } else {
                    const final = "请不要戳小小夜 >_<";
                    request(
                      `http://${GO_CQHTTP_SERVICE_API_URL}/send_group_msg?group_id=${event.group_id
                      }&message=${encodeURI(final)}`);
                  }
                  return 0;
                }

                //嘴臭，小夜的回复转化为语音
                if (Constants.come_yap_reg.test(event.message)) {
                  let message = event.message.replace("/嘴臭 ", "");
                  message = message.replace("/嘴臭", "");
                  console.log(`有人对线说 ${message}，小夜要嘴臭了`.log);
                  io.emit(
                    "system message",
                    `@有人对线说 ${message}，小夜要嘴臭了`,
                  );
                  ChatProcess(message)
                    .then((reply) => {
                      plugins.tts.execute(`吠 ${reply}`)
                        .then((resolve) => {
                          const tts_file = `[CQ:record,file=http://127.0.0.1:${WEB_PORT}${resolve.file},url=http://127.0.0.1:${WEB_PORT}${resolve.file}]`;
                          res.send({ reply: tts_file });
                        })
                        .catch((reject) => {
                          console.log(`TTS错误: ${reject}`.error);
                        });
                    });
                  return 0;
                }

                //伪造转发
                if (Constants.fake_forward_reg.test(event.message)) {
                  let who,
                    name = event.sender.nickname,
                    text,
                    xiaoye_say,
                    requestData;
                  if (event.message == "/强制迫害") {
                    who = event.sender.user_id; //如果没有要求迫害谁，那就是迫害自己
                  } else {
                    let msg = event.message + " "; //结尾加一个空格防爆

                    // for (let i in msg.substr(i).split(" ")) {
                    //   console.log(msg[i]);
                    // }

                    msg = msg.substr(4).split(" ");
                    who = msg[1].trim(); //谁
                    text = msg[2].trim(); //说啥
                    xiaoye_say = msg[3].trim(); //小夜说啥
                    who = who.replace("/强制迫害 ", "");
                    who = who.replace("/强制迫害", "");
                    who = who.replace("[CQ:at,qq=", "");
                    who = who.replace("]", "");
                    who = who.trim();
                    if (Constants.is_qq_reg.test(who)) {
                      console.log(
                        `群 ${event.group_id} 的 群员 ${event.user_id} 强制迫害 ${who}`
                          .log,
                      );
                    } else {
                      //目标不是qq号
                      who = event.sender.user_id; //如果没有要求迫害谁，那就是迫害自己
                    }
                  }

                  if (!name) {
                    name = event.sender.nickname;
                  }

                  if (!text) {
                    text = "我是群友专用RBQ";
                  }

                  if (!xiaoye_say) {
                    xiaoye_say =
                      "[CQ:image,file=1ea870ec3656585d4a81e13648d66db5.image,url=https://gchat.qpic.cn/gchatpic_new/1277161008/2063243247-2238741340-1EA870EC3656585D4A81E13648D66DB5/0?term=3]";
                  }

                  //发送
                  //先获取昵称
                  request(
                    `http://${GO_CQHTTP_SERVICE_API_URL}/get_group_member_info?group_id=${event.group_id}&user_id=${who}&no_cache=0`,
                    function (error, _response, body) {
                      if (!error) {
                        body = JSON.parse(body);
                        name = body.data.nickname;

                        requestData = {
                          group_id: event.group_id,
                          messages: [
                            {
                              type: "node",
                              data: { name: name, uin: who, content: text },
                            },
                            {
                              type: "node",
                              data: {
                                name: "星野夜蝶Official",
                                uin: "1648468212",
                                content: xiaoye_say,
                              },
                            },
                          ],
                        };

                        request(
                          {
                            url: `http://${GO_CQHTTP_SERVICE_API_URL}/send_group_forward_msg`,
                            method: "POST",
                            json: true,
                            headers: {
                              "content-type": "application/json",
                            },
                            body: requestData,
                          },
                          function (error, response, body) {
                            if (!error && response.statusCode == 200) {
                              console.log(body);
                            }
                          },
                        );
                      } else {
                        requestData = {
                          group_id: event.group_id,
                          messages: [
                            {
                              type: "node",
                              data: { name: name, uin: who, content: text },
                            },
                            {
                              type: "node",
                              data: {
                                name: "星野夜蝶Official",
                                uin: "1648468212",
                                content: xiaoye_say,
                              },
                            },
                          ],
                        };

                        request(
                          {
                            url: `http://${GO_CQHTTP_SERVICE_API_URL}/send_group_forward_msg`,
                            method: "POST",
                            json: true,
                            headers: {
                              "content-type": "application/json",
                            },
                            body: requestData,
                          },
                          function (error, response, body) {
                            if (!error && response.statusCode == 200) {
                              console.log(body);
                            }
                          },
                        );
                      }
                    },
                  );
                  return 0;
                }

                //一个手雷
                if (Constants.hand_grenade_reg.test(event.message)) {
                  let who;
                  let holly_hand_grenade = Math.floor(Math.random() * 1000); //丢一个骰子，判断手雷是否变成神圣手雷
                  let success_flag = Math.floor(Math.random() * 100); //丢一个骰子，判断手雷是否成功丢出
                  let boom_time = Math.floor(Math.random() * 60 * 2); //造成伤害时间
                  if (holly_hand_grenade < 10) {
                    //运营方暗调了出率，10‰几率变成神圣手雷
                    request(
                      `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_whole_ban?group_id=${event.group_id}&enable=1`,
                      function (error, _response, _body) {
                        if (!error) {
                          console.log(
                            `触发了神圣手雷，群 ${event.group_id} 被全体禁言`
                              .error,
                          );
                          res.send({
                            reply: "噢，该死，我的上帝啊，真是不敢相信，瞧瞧我发现了什么，我发誓我没有看错，这竟然是一颗出现率为千分之一的神圣手雷!我是说，这是一颗毁天灭地的神圣手雷啊!哈利路亚!麻烦管理员解除一下",
                          });
                        }
                      },
                    );
                    return 0;
                  } else {
                    if (event.message === "一个手雷") {
                      who = event.user_id; //如果没有要求炸谁，那就是炸自己
                      console.log(
                        `群 ${event.group_id} 的群员 ${event.user_id} 朝自己丢出一颗手雷`
                          .log,
                      );
                    } else {
                      who = event.message;
                      who = who.replace("一个手雷 ", "");
                      who = who.replace("一个手雷", "");
                      who = who.replace("[CQ:at,qq=", "");
                      who = who.replace("]", "");
                      who = who.trim();
                      if (Constants.is_qq_reg.test(who)) {
                        console.log(
                          `群 ${event.group_id} 的 群员 ${event.user_id} 尝试向 ${who} 丢出一颗手雷`
                            .log,
                        );
                      } else {
                        //目标不是qq号
                        res.send({
                          reply: `你想丢给谁手雷啊，目标不可以是${who}，不要乱丢`,
                        });
                        return 0;
                      }
                    }
                    if (success_flag < 50 || who === event.user_id) {
                      //50%几率被自己炸伤
                      console.log(
                        `群 ${event.group_id} 的 群员 ${event.user_id} 的手雷炸到了自己`
                          .log,
                      );
                      res.send({
                        reply: `[CQ:at,qq=${event.user_id}] 小手一滑，被自己丢出的手雷炸伤，造成了${boom_time}秒的伤害，苍天有轮回，害人终害己，祝你下次好运`,
                        ban: 1,
                        ban_duration: boom_time,
                      });
                    } else {
                      //成功丢出手雷
                      request(
                        `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_ban?group_id=${event.group_id}&user_id=${who}&duration=${boom_time}`,
                        function (error, _response, _body) {
                          if (!error) {
                            console.log(
                              `群 ${event.group_id} 的 群员 ${event.user_id} 的手雷炸到了 ${who}`
                                .log,
                            );
                            res.send({
                              reply: `恭喜[CQ:at,qq=${who}]被[CQ:at,qq=${event.user_id}]丢出的手雷炸伤，造成了${boom_time}秒的伤害，祝你下次好运`,
                            });
                          }
                        },
                      );
                    }
                  }
                  return 0;
                }

                //埋地雷
                if (Constants.mine_reg.test(event.message)) {
                  //获取该群是否已经达到最大共存地雷数
                  db.all(
                    `SELECT * FROM mine WHERE group_id = '${event.group_id}'`,
                    (err, sql) => {
                      if (!err) {
                        let length = 0;
                        try {
                          length = sql.length;
                        } catch (err) {
                          console.log("地雷为空".log);
                        }
                        if (length < QQBOT_MAX_MINE_AT_MOST) {
                          //地雷还没满，先获取自增ID最新值sql.seq，随后mine表增加群地雷
                          db.all(
                            "Select seq From sqlite_sequence Where name = 'mine'",
                            (err, sql) => {
                              if (!err && sql[0]) {
                                db.run(
                                  `INSERT INTO mine VALUES('${sql[0].seq + 1
                                  }', '${event.group_id}', '${event.user_id
                                  }')`,
                                );
                                console.log(
                                  `${event.user_id} 在群 ${event.group_id} 埋了一颗地雷`
                                    .log,
                                );
                                res.send({
                                  reply: `大伙注意啦![CQ:at,qq=${event.user_id}]埋雷干坏事啦!`,
                                });
                              } else {
                                console.log(
                                  `埋地雷出错了: ${err}，${sql}`.error,
                                );
                              }
                            },
                          );
                        } else {
                          console.log(`群 ${event.group_id} 的地雷满了`.log);
                          res.send({
                            reply: `[CQ:at,qq=${event.user_id}] 这个群的地雷已经塞满啦，等有幸运群友踩中地雷之后再来埋吧`,
                          });
                          return 0;
                        }
                      } else {
                        console.log(`获取该群地雷出错了: ${err}，${sql}`.error);
                      }
                    },
                  );
                  return 0;
                }

                //踩地雷
                if (Constants.fuck_mine_reg.test(event.message)) {
                  //搜索地雷库中现有地雷
                  db.all(
                    `SELECT * FROM mine WHERE group_id = '${event.group_id}'`,
                    (err, sql) => {
                      //有雷，直接炸，炸完删地雷
                      if (!err && sql[0]) {
                        let boom_time = Math.floor(Math.random() * 60 * 3) + 60; //造成伤害时间
                        console.log(
                          `${sql[0].placed_qq} 在群 ${sql[0].group_id} 埋的地雷被排爆，雷已经被删除`
                            .log,
                        );
                        db.run(
                          `DELETE FROM mine WHERE mine_id = '${sql[0].mine_id}' `,
                        );
                        res.send({
                          reply: `[CQ:at,qq=${event.user_id}] 踩了一脚地雷，为什么要想不开呢，被[CQ:at,qq=${sql[0].placed_qq}]所埋地雷炸成重伤，休养生息${boom_time}秒!`,
                          ban: 1,
                          ban_duration: boom_time,
                        });
                        return 0;
                      } else {
                        //没有雷
                        res.send({
                          reply: `[CQ:at,qq=${event.user_id}] 这个雷区里的雷似乎已经被勇士们排干净了，不如趁现在埋一个吧!`,
                        });
                      }
                    },
                  );
                  return 0;
                }

                //希望的花
                if (Constants.hope_flower_reg.test(event.message)) {
                  let who;
                  let boom_time = Math.floor(Math.random() * 30); //造成0-30伤害时间
                  if (event.message === "希望的花") {
                    console.log(
                      `群 ${event.group_id} 的群员 ${event.user_id} 朝自己丢出一朵希望的花`
                        .log,
                    );
                    res.send({
                      reply: "团长，你在做什么啊!团长!希望的花，不要乱丢啊啊啊啊",
                    });
                    return 0;
                  } else {
                    who = event.message;
                    who = who.replace("希望的花 ", "");
                    who = who.replace("希望的花", "");
                    who = who.replace("[CQ:at,qq=", "");
                    who = who.replace("]", "");
                    who = who.trim();
                    if (Constants.is_qq_reg.test(who)) {
                      console.log(
                        `群 ${event.group_id} 的 群员 ${event.user_id} 向 ${who} 丢出一朵希望的花`
                          .log,
                      );
                    } else {
                      //目标不是qq号
                      res.send({
                        reply: `团长，你在做什么啊!团长!希望的花目标不可以是${who}，不要乱丢啊啊啊啊`,
                      });
                      return 0;
                    }
                  }

                  //先救活目标
                  request(
                    `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_ban?group_id=${event.group_id}&user_id=${who}&duration=0`,
                    function (error, _response, _body) {
                      if (!error) {
                        console.log(
                          `群 ${event.group_id} 的 群员 ${event.user_id} 救活了 ${who}`
                            .log,
                        );
                        res.send({
                          reply: `团长，团长你在做什么啊团长，团长!为什么要救他啊，哼，呃，啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊!!!团长救下了[CQ:at,qq=${who}]，但自己被炸飞了，休养生息${boom_time}秒!不要停下来啊!`,
                        });
                      }
                    },
                  );

                  //再禁言团长
                  request(
                    `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_ban?group_id=${event.group_id}&user_id=${event.user_id}&duration=${boom_time}`,
                    function (error, _response, _body) {
                      if (!error) {
                        console.log(
                          `${event.user_id} 自己被炸伤${boom_time}秒`.log,
                        );
                      }
                    },
                  );
                  return 0;
                }

                //击鼓传雷
                if (Constants.loop_bomb_reg.test(event.message)) {
                  //先检查群有没有开始游戏
                  db.all(
                    `SELECT * FROM qq_group WHERE group_id = '${event.group_id}'`,
                    (err, sql) => {
                      if (!err && sql[0]) {
                        //判断游戏开关 loop_bomb_enabled，没有开始的话就开始游戏，如果游戏已经超时结束了的话重新开始
                        if (
                          sql[0].loop_bomb_enabled === 0 ||
                          60 -
                          process.hrtime([
                            sql[0].loop_bomb_start_time,
                            0,
                          ])[0] <
                          0
                        ) {
                          //游戏开始
                          db.run(
                            `UPDATE qq_group SET loop_bomb_enabled = '1' WHERE group_id ='${event.group_id}'`,
                          );
                          let text =
                            "击鼓传雷游戏开始啦，这是一个只有死亡才能结束的游戏，做好准备了吗";
                          request(
                            `http://${GO_CQHTTP_SERVICE_API_URL}/send_group_msg?group_id=${event.group_id
                            }&message=${encodeURI(text)}`,
                            function (error, _response, _body) {
                              if (!error) {
                                console.log(
                                  `群 ${event.group_id} 开始了击鼓传雷`.log,
                                );
                                io.emit(
                                  "system",
                                  `@群 ${event.group_id} 开始了击鼓传雷`,
                                );
                              }
                            },
                          );

                          //给发起人出题，等待ta回答
                          ECYWenDa()
                            .then((resolve) => {
                              let question = `那么[CQ:at,qq=${event.user_id}]请听题: ${resolve.quest} 请告诉小夜: 击鼓传雷 你的答案，时间剩余59秒`;
                              let answer = resolve.result; //把答案、目标人、开始时间存入数据库
                              db.run(
                                `UPDATE qq_group SET loop_bomb_answer = '${answer}', loop_bomb_owner = '${event.user_id
                                }' , loop_bomb_start_time = '${process.hrtime()[0]
                                }' WHERE group_id ='${event.group_id}'`,
                              );

                              //金手指
                              request(
                                `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_card?group_id=${event.group_id
                                }&user_id=${event.user_id}&card=${encodeURI(
                                  answer,
                                )}`,
                                function (error, _response, _body) {
                                  if (!error) {
                                    console.log("击鼓传雷金手指已启动".log);
                                  }
                                },
                              );

                              //丢出问题
                              setTimeout(function () {
                                request(
                                  `http://${GO_CQHTTP_SERVICE_API_URL}/send_group_msg?group_id=${event.group_id
                                  }&message=${encodeURI(question)}`);
                              }, 1000);
                            })
                            .catch((reject) => {
                              res.send({
                                reply: `日忒娘，怎么又出错了: ${reject}`,
                              });
                              console.log(
                                `日忒娘，怎么又出错了: ${reject}`.error,
                              );
                            });

                          //开始倒计时，倒计时结束宣布游戏结束
                          boomTimer = setTimeout(function () {
                            console.log(
                              `群 ${event.group_id} 的击鼓传雷到达时间，炸了`
                                .log,
                            );
                            let boom_time =
                              Math.floor(Math.random() * 60 * 3) + 60; //造成伤害时间
                            //获取这个雷现在是谁手上，炸ta
                            db.all(
                              `SELECT * FROM qq_group WHERE group_id = '${event.group_id}'`,
                              (err, sql) => {
                                if (!err && sql[0]) {
                                  request(
                                    `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_ban?group_id=${event.group_id}&user_id=${sql[0].loop_bomb_owner}&duration=${boom_time}`,
                                    function (error, _response, _body) {
                                      if (!error) {
                                        console.log(
                                          `${sql[0].loop_bomb_owner} 在群 ${event.group_id} 回答超时，被炸伤${boom_time}秒`
                                            .log,
                                        );

                                        //金手指关闭
                                        request(
                                          `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_card?group_id=${event.group_id}&user_id=${sql[0].loop_bomb_owner}&card=`,
                                          function (error, _response, _body) {
                                            if (!error) {
                                              console.log(
                                                "击鼓传雷金手指已恢复".log,
                                              );
                                            }
                                          },
                                        );

                                        let end = `时间到了，pia，雷在[CQ:at,qq=${sql[0].loop_bomb_owner}]手上炸了，你被炸成重伤了，休养生息${boom_time}秒!游戏结束!下次加油噢，那么答案公布: ${sql[0].loop_bomb_answer}`;
                                        request(
                                          `http://${GO_CQHTTP_SERVICE_API_URL}/send_group_msg?group_id=${event.group_id
                                          }&message=${encodeURI(end)}`,
                                          function (error, _response, _body) {
                                            if (!error) {
                                              io.emit(
                                                "system",
                                                `@${sql[0].loop_bomb_owner} 在群 ${event.group_id} 回答超时，被炸伤${boom_time}秒`,
                                              );
                                            }
                                          },
                                        );
                                        //游戏结束，清空数据
                                        db.run(
                                          `UPDATE qq_group SET loop_bomb_enabled = '0', loop_bomb_answer = '', loop_bomb_owner = '' , loop_bomb_start_time = '' WHERE group_id ='${event.group_id}'`,
                                        );
                                        return 0;
                                      }
                                    },
                                  );
                                  io.emit(
                                    "system",
                                    `@群 ${event.group_id} 的击鼓传雷到达时间，炸了`,
                                  );
                                }
                              },
                            );
                          }, 1000 * 60);

                          //已经开始游戏了，判断答案对不对
                        } else {
                          let your_answer = event.message;
                          your_answer = your_answer.replace("击鼓传雷 ", "");
                          your_answer = your_answer.replace("击鼓传雷", "");
                          your_answer = your_answer.trim();
                          //从数据库里取答案判断
                          db.all(
                            `SELECT * FROM qq_group WHERE group_id = '${event.group_id}'`,
                            (err, sql) => {
                              if (!err && sql[0]) {
                                //判断答案 loop_bomb_answer
                                if (sql[0].loop_bomb_answer == your_answer) {
                                  //答对了
                                  //不是本人回答，是来抢答的
                                  if (
                                    sql[0].loop_bomb_owner != event.user_id
                                  ) {
                                    //无论对错都惩罚
                                    let end = `[CQ:at,qq=${event.user_id}] 抢答正确!答案确实是 ${sql[0].loop_bomb_answer}!但因为抢答了所以被惩罚了!`;
                                    request(
                                      `http://${GO_CQHTTP_SERVICE_API_URL}/send_group_msg?group_id=${event.group_id
                                      }&message=${encodeURI(end)}`,
                                      function (error, _response, _body) {
                                        if (!error) {
                                          io.emit(
                                            "system",
                                            `@${event.user_id} 在群 ${event.group_id} 回答正确`,
                                          );

                                          //金手指关闭
                                          request(
                                            `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_card?group_id=${event.group_id}&user_id=${sql[0].loop_bomb_owner}&card=`, //event.user_id
                                            function (error, _response, _body) {
                                              if (!error) {
                                                console.log(
                                                  "击鼓传雷金手指已恢复".log,
                                                );
                                              }
                                            },
                                          );

                                          //禁言
                                          request(
                                            `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_ban?group_id=${event.group_id}&user_id=${event.user_id}&duration=60`,
                                            function (error, _response, _body) {
                                              if (!error) {
                                                console.log(
                                                  `抢答了，${event.user_id} 被禁言`
                                                    .error,
                                                );
                                              }
                                            },
                                          );
                                        }
                                      },
                                    );
                                  } else {
                                    //回答正确
                                    //金手指关闭
                                    request(
                                      `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_card?group_id=${event.group_id}&user_id=${event.user_id}&card=`,
                                      function (error, _response, _body) {
                                        if (!error) {
                                          console.log(
                                            "击鼓传雷金手指已启动".log,
                                          );
                                        }
                                      },
                                    );
                                    let end = `[CQ:at,qq=${event.user_id}] 回答正确!答案确实是 ${sql[0].loop_bomb_answer}!`;
                                    request(
                                      `http://${GO_CQHTTP_SERVICE_API_URL}/send_group_msg?group_id=${event.group_id
                                      }&message=${encodeURI(end)}`,
                                      function (error, _response, _body) {
                                        if (!error) {
                                          io.emit(
                                            "system",
                                            `@${sql[0].loop_bomb_owner} 在群 ${event.group_id} 回答正确`,
                                          );
                                        }
                                      },
                                    );
                                  }
                                  //答题成功，然后要把雷传给随机幸运群友，进入下一题
                                  setTimeout(function () {
                                    request(
                                      `http://${GO_CQHTTP_SERVICE_API_URL}/get_group_member_list?group_id=${event.group_id}`,
                                      (err, response, body) => {
                                        body = JSON.parse(body);
                                        if (!err && body.data.length != 0) {
                                          var rand_user_id = Math.floor(
                                            Math.random() * body.data.length,
                                          );
                                          console.log(
                                            `随机选取一个群友: ${body.data[rand_user_id].user_id}`
                                              .log,
                                          );
                                          let rand_user =
                                            body.data[rand_user_id].user_id;

                                          //选完之后开始下一轮游戏，先查询剩余时间，然后给随机幸运群友出题，等待ta回答
                                          db.all(
                                            `SELECT * FROM qq_group WHERE group_id = '${event.group_id}'`,
                                            (err, sql) => {
                                              if (!err && sql[0]) {
                                                ECYWenDa()
                                                  .then((resolve) => {
                                                    let diff =
                                                      60 -
                                                      process.hrtime([
                                                        sql[0]
                                                          .loop_bomb_start_time,
                                                        0,
                                                      ])[0]; //剩余时间
                                                    let question = `抽到了幸运群友[CQ:at,qq=${rand_user}]!请听题: ${resolve.quest} 请告诉小夜:  击鼓传雷 你的答案，时间还剩余${diff}秒`;
                                                    let answer = resolve.result; //把答案、目标人存入数据库
                                                    db.run(
                                                      `UPDATE qq_group SET loop_bomb_answer = '${answer}', loop_bomb_owner = '${rand_user}' WHERE group_id ='${event.group_id}'`,
                                                    );

                                                    //金手指
                                                    request(
                                                      `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_card?group_id=${event.group_id
                                                      }&user_id=${rand_user}&card=${encodeURI(
                                                        answer,
                                                      )}`,
                                                      function (
                                                        error,
                                                        _response,
                                                        _body,
                                                      ) {
                                                        if (!error) {
                                                          console.log(
                                                            "击鼓传雷金手指已启动"
                                                              .log,
                                                          );
                                                        }
                                                      },
                                                    );

                                                    request(
                                                      `http://${GO_CQHTTP_SERVICE_API_URL}/send_group_msg?group_id=${event.group_id
                                                      }&message=${encodeURI(
                                                        question,
                                                      )}`,
                                                      function (
                                                        error,
                                                        _response,
                                                        _body,
                                                      ) {
                                                        if (!error) {
                                                          console.log(
                                                            `群 ${event.group_id} 开始了下一轮击鼓传雷`
                                                              .log,
                                                          );
                                                          io.emit(
                                                            "system",
                                                            `@群 ${event.group_id} 开始了下一轮击鼓传雷`,
                                                          );
                                                        }
                                                      },
                                                    );
                                                  })
                                                  .catch((reject) => {
                                                    res.send({
                                                      reply: `日忒娘，怎么又出错了: ${reject}`,
                                                    });
                                                    console.log(
                                                      `日忒娘，怎么又出错了: ${reject}`
                                                        .error,
                                                    );
                                                  });
                                              }
                                            },
                                          );
                                        } else {
                                          console.log(
                                            "随机选取一个群友错误。错误原因: " +
                                            JSON.stringify(response.body),
                                          );
                                        }
                                        return 0;
                                      },
                                    );
                                  }, 500);

                                  //答错了
                                } else {
                                  let boom_time =
                                    Math.floor(Math.random() * 60 * 3) + 60; //造成伤害时间
                                  let end = `[CQ:at,qq=${event.user_id}] 回答错误，好可惜，你被炸成重伤了，休养生息${boom_time}秒!游戏结束!下次加油噢，那么答案公布: ${sql[0].loop_bomb_answer}`;
                                  console.log(
                                    `${event.user_id} 在群 ${event.group_id} 回答错误，被炸伤${boom_time}秒`
                                      .log,
                                  );
                                  clearTimeout(boomTimer);

                                  request(
                                    `http://${GO_CQHTTP_SERVICE_API_URL}/send_group_msg?group_id=${event.group_id
                                    }&message=${encodeURI(end)}`,
                                    function (error, _response, _body) {
                                      if (!error) {
                                        io.emit(
                                          "system",
                                          `@${sql[0].loop_bomb_owner} 在群 ${event.group_id} 回答正确`,
                                        );
                                        //禁言
                                        request(
                                          `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_ban?group_id=${event.group_id}&user_id=${event.user_id}&duration=${boom_time}`,
                                          function (error, _response, _body) {
                                            if (!error) {
                                              console.log(
                                                `抢答了，${event.user_id} 被禁言`
                                                  .error,
                                              );
                                            }
                                          },
                                        );
                                      }
                                    },
                                  );

                                  //游戏结束，删掉游戏记录
                                  db.run(
                                    `UPDATE qq_group SET loop_bomb_enabled = '0', loop_bomb_answer = '', loop_bomb_owner = '' , loop_bomb_start_time = '' WHERE group_id ='${event.group_id}'`,
                                  );

                                  //金手指关闭
                                  request(
                                    `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_card?group_id=${event.group_id}&user_id=${sql[0].loop_bomb_owner}&card=`,
                                    function (error, _response, _body) {
                                      if (!error) {
                                        console.log("击鼓传雷金手指已启动".log);
                                      }
                                    },
                                  );

                                  request(
                                    `http://${GO_CQHTTP_SERVICE_API_URL}/set_group_card?group_id=${event.group_id}&user_id=${event.user_id}&card=`,
                                    function (error, _response, _body) {
                                      if (!error) {
                                        console.log("击鼓传雷金手指已启动".log);
                                      }
                                    },
                                  );

                                  return 0;
                                }
                              }
                            },
                          );
                        }
                      }
                    },
                  );
                }

                //我有个朋友
                if (Constants.i_have_a_friend_reg.test(event.message)) {
                  //指定目标的话
                  if (Constants.has_qq_reg.test(event.message)) {
                    var msg_in = event.message.split("说")[1];
                    var msg = msg_in.split("[CQ:at,qq=")[0].trim();
                    var who = msg_in.split("[CQ:at,qq=")[1];
                    who = who.replace("]", "").trim();
                    if (Constants.is_qq_reg.test(who)) {
                      var sources = `https://api.sumt.cn/api/qq.logo.php?qq=${who}`; //载入头像
                    }
                    //没指定目标
                  } else {
                    var msg = event.message.split("说")[1];
                    var sources = `https://api.sumt.cn/api/qq.logo.php?qq=${event.user_id}`; //没有指定谁，那这个朋友就是ta自己
                  }

                  loadImage(sources).then((image) => {
                    let canvas = createCanvas(350, 80);
                    let ctx = canvas.getContext("2d");
                    ctx.fillStyle = "WHITE";
                    ctx.fillRect(0, 0, 350, 80);
                    ctx.font = "20px SimHei";
                    ctx.textAlign = "left";
                    ctx.fillStyle = "#000000";
                    ctx.fillText("沙雕网友群", 90.5, 35.5);
                    ctx.font = "16px SimHei";
                    ctx.fillStyle = "#716F81";
                    ctx.fillText(`沙雕网友: ${msg}`, 90.5, 55.5);
                    ctx.font = "13px SimHei";
                    ctx.fillText(utils.GetTimes().Clock, 280.5, 35.5);

                    ctx.beginPath();
                    ctx.arc(40, 40, 28, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.clip();
                    ctx.drawImage(image, 10, 10, 60, 60);
                    ctx.closePath();

                    let file_local = path.join(
                      process.cwd(),
                      "static",
                      "xiaoye",
                      "images",
                      `${utils.sha1(canvas.toBuffer())}.jpg`,
                    );
                    fs.writeFileSync(file_local, canvas.toBuffer());
                    let file_online = `http://127.0.0.1:${WEB_PORT}/xiaoye/images/${utils.sha1(
                      canvas.toBuffer(),
                    )}.jpg`;
                    console.log(
                      `我有个朋友合成成功，图片发送: ${file_online}`.log,
                    );
                    res.send({
                      reply: `[CQ:image,file=${file_online},url=${file_online}]`,
                    });
                  });
                  return 0;
                }

                //孤寡
                if (Constants.gugua_reg.test(event.message)) {
                  if (event.message == "/孤寡") {
                    res.send({
                      reply: "小夜收到了你的孤寡订单，现在就开始孤寡你了噢孤寡~",
                    });
                    utils.GuGua(event.user_id);
                    return 0;
                  }
                  let who = event.message.replace("/孤寡 ", "");
                  who = who.replace("/孤寡", "");
                  who = who.replace("[CQ:at,qq=", "");
                  who = who.replace("]", "");
                  who = who.trim();
                  if (Constants.is_qq_reg.test(who)) {
                    request(
                      `http://${GO_CQHTTP_SERVICE_API_URL}/get_friend_list`,
                      (err, _response, body) => {
                        body = JSON.parse(body);
                        if (!err && body.data.length != 0) {
                          for (let i in body.data) {
                            if (who == body.data[i].user_id) {
                              res.send({
                                reply: `小夜收到了你的孤寡订单，现在就开始孤寡[CQ:at,qq=${who}]了噢孤寡~`,
                              });
                              request(
                                `http://${GO_CQHTTP_SERVICE_API_URL}/send_private_msg?user_id=${who}&message=${encodeURI(
                                  `您好，我是孤寡小夜，您的好友 ${event.user_id} 给您点了一份孤寡套餐，请查收`,
                                )}`,
                                function (error, _response, _body) {
                                  if (!error) {
                                    console.log(
                                      `群 ${event.group_id} 的 群员 ${event.user_id} 孤寡了 ${who}`
                                        .log,
                                    );
                                  }
                                },
                              );
                              utils.GuGua(who);
                              return 0;
                            }
                          }
                          res.send({
                            reply: `小夜没有[CQ:at,qq=${who}]的好友，没有办法孤寡ta呢，请先让ta加小夜为好友吧，小夜就在群里给大家孤寡一下吧`,
                          });
                          utils.QunGuGua(event.group_id);
                        }
                      },
                    );
                  } else {
                    //目标不是qq号
                    res.send({
                      reply: `你想孤寡谁啊，目标不可以是${who}，不要乱孤寡，小心孤寡你一辈子啊`,
                    });
                    return 0;
                  }
                  return 0;
                }

                //手动复读，复读回复中指定的消息
                if (Constants.reply_reg.test(event.message)) {
                  //从 [CQ:reply,id=-1982767585][CQ:at,qq=1005056803] 复读 消息里获取id

                  const msgID = event.message.split("id=")[1].split("]")[0].trim();
                  logger.info(`收到手动复读指令，消息id: ${msgID}`.log);

                  request(
                    `http://${GO_CQHTTP_SERVICE_API_URL}/get_msg?message_id=${msgID}`,
                    function (error, _response, body) {
                      body = JSON.parse(body);
                      if (!error) {
                        logger.info(`复读历史消息: ${body.data.message}`.log);
                        res.send({ reply: body.data.message });
                      }
                    },
                  );
                  return 0;
                }

                //管理员功能: 提醒停止服务的群启用小夜
                if (event.message === "/提醒启用小夜") {
                  for (let i in QQBOT_ADMIN_LIST) {
                    if (event.user_id == QQBOT_ADMIN_LIST[i]) {
                      logger.info("管理员启动了提醒任务".log);
                      AlertOpen().then((resolve) => {
                        res.send({
                          reply: `管理员启动了提醒任务，开始提醒停止服务的群启用小夜……${resolve}`,
                        });
                      });
                      return 0;
                    }
                  }
                  res.send({
                    reply: "你不是狗管理噢，不能让小夜这样那样的",
                  });
                  return 0;
                }

                //管理员功能: 修改聊天回复率
                if (
                  Constants.change_reply_probability_reg.test(event.message)
                ) {
                  for (let i in QQBOT_ADMIN_LIST) {
                    if (event.user_id == QQBOT_ADMIN_LIST[i]) {
                      let msg = event.message.replace("/回复率 ", "");
                      QQBOT_REPLY_PROBABILITY = msg;
                      res.send({
                        reply: `小夜回复率已修改为${msg}%`,
                      });
                      return 0;
                    }
                  }
                  res.send({
                    reply: "你不是狗管理噢，不能让小夜这样那样的",
                  });
                  return 0;
                }

                //管理员功能: 修改聊天随机复读率
                if (
                  Constants.change_fudu_probability_reg.test(event.message)
                ) {
                  for (let i in QQBOT_ADMIN_LIST) {
                    if (event.user_id == QQBOT_ADMIN_LIST[i]) {
                      let msg = event.message.replace("/复读率 ", "");
                      QQBOT_FUDU_PROBABILITY = msg;
                      res.send({
                        reply: `小夜复读率已修改为${msg}%`,
                      });
                      return 0;
                    }
                  }
                  res.send({
                    reply: "你不是狗管理噢，不能让小夜这样那样的",
                  });
                  return 0;
                }

                //丢一个骰子，按fudu_probability几率复读
                let fudu_flag = Math.floor(Math.random() * 100);
                if (fudu_flag < QQBOT_FUDU_PROBABILITY) {
                  logger.info(`小夜复读 ${event.message}`.log);
                  io.emit(
                    "system",
                    `@小夜复读 ${event.message}`,
                  );
                  res.send({ reply: event.message });
                  return 0;
                }

                //丢一个骰子，按reply_probability几率回复
                let reply_flag = Math.floor(Math.random() * 100);
                //如果被@了，那么回复几率上升80%
                let at_replaced_msg = event.message; //要把[CQ:at,qq=${event.message?.self_id ?? QQBOT_QQ}] 去除掉，否则聊天核心会乱成一锅粥
                if (xiaoye_ated.test(event.message)) {
                  reply_flag -= 80;
                  at_replaced_msg = event.message
                    .replace(`[CQ:at,qq=${event.message?.self_id ?? QQBOT_QQ}]`, "")
                    .trim(); //去除@小夜
                }
                //骰子命中，那就让小夜来自动回复
                if (reply_flag < QQBOT_REPLY_PROBABILITY) {
                  ChatProcess(at_replaced_msg)
                    .then((resolve) => {
                      if (
                        resolve.indexOf("[name]") ||
                        resolve.indexOf("&#91;name&#93;")
                      ) {
                        resolve = resolve
                          .toString()
                          .replace("[name]", `[CQ:at,qq=${event.user_id}]`); //替换[name]为正确的@
                        resolve = resolve
                          .toString()
                          .replace(
                            "&#91;name&#93;",
                            `[CQ:at,qq=${event.user_id}]`,
                          ); //替换[name]为正确的@
                      }
                      logger.info(`小夜回复 ${resolve}`.log);
                      io.emit("system", `@小夜回复: ${resolve}`);
                      res.send({ reply: resolve });
                      return 0;
                    });
                } else {
                  res.send(); //相当于严格模式，如果有多条res.send将会报错 `重复响应`
                }
              }
              //群不存在于qq_group表则写入qq_group表
            } else {
              logger.info(
                `${event.group_id} 这个群不在qq_group表里，现在写入到qq_group表`.log,
              );
              db.run(
                `INSERT INTO qq_group VALUES('${event.group_id}', '1', '0', '', '', '')`,
              );
              res.send();
            }
          },
        );
      }
    } else if (
      event.message_type == "private" &&
      QQBOT_PRIVATE_CHAT_SWITCH == true
    ) {
      //私聊回复
      ChatProcess(event.message)
        .then((resolve) => {
          logger.info(`小夜回复 ${resolve}`.log);
          io.emit("system", `@小夜回复: ${resolve}`);
          res.send({ reply: resolve });
        });
      return 0;
    }
    res.send();
    return 0;
  });

  //每隔24小时搜索qq_group表，随机延时提醒停用服务的群启用服务
  setInterval(AlertOpen, 1000 * 60 * 60 * 24);
  //提醒张菊
  function AlertOpen() {
    return new Promise((resolve, _reject) => {
      db.all("SELECT * FROM qq_group WHERE talk_enabled = 0", (err, sql) => {
        if (!err && sql[0]) {
          let serviceStoppedList = []; //停用服务的群列表
          for (let i in sql) {
            serviceStoppedList.push(sql[i].group_id);
          }
          logger.info(
            `以下群未启用小夜服务: ${serviceStoppedList} ，现在开始随机延时提醒`.log,
          );
          utils.DelayAlert(serviceStoppedList);
          resolve(
            `以下群未启用小夜服务: ${serviceStoppedList} ，现在开始随机延时提醒`,
          );
        } else {
          logger.info("目前没有群是关闭服务的，挺好".log);
        }
      });
    });
  }
}

/**
 * qq内嵌的频道的消息处理，并不是独立的qq频道
 */
async function ProcessGuildMessage(event) {
  //qq内嵌频道插件应答器
  const pluginsReply = await ProcessExecute(
    event.message,
    event.user_id,
    event?.sender?.nickname,
    event.channel_id,
    "", //群名暂时还没加
    ""
  );

  if (pluginsReply != "") {
    const replyToGuild = utils.PluginAnswerToGoCqhttpStyle(pluginsReply);
    request(
      `http://${GO_CQHTTP_SERVICE_API_URL}/send_guild_channel_msg?guild_id=${event.guild_id}&channel_id=${event.channel_id}&message=${encodeURI(
        replyToGuild,
      )}`);
  }
}

/**
 * 虚拟主播星野夜蝶核心代码，星野夜蝶上线!
 */
function StartLive() {
  const live = new KeepLiveTCP(BILIBILI_LIVE_ROOM_ID);
  live.on("open", () => logger.info(`哔哩哔哩直播间 ${BILIBILI_LIVE_ROOM_ID} 连接成功`.log));

  live.on("live", () => {
    live.on("heartbeat", (online) => logger.info(`直播间在线人数: ${online}`.log));

    live.on("DANMU_MSG", async (data) => {
      const danmu = {
        content: data.info[1],
        userId: data.info[2][0],
        userName: data.info[2][1]
      };

      console.log(`${danmu.userName} 说: ${danmu.content}`.log);

      //哔哩哔哩端插件应答器
      const pluginsReply = await ProcessExecute(danmu.content, danmu.userId, danmu.userName) ?? "";
      let replyToBiliBili = "";
      if (pluginsReply) {
        //插件响应弹幕
        replyToBiliBili = pluginsReply;
      } else {
        //交给聊天函数处理
        const chatReply = await ChatProcess(danmu.content);
        if (chatReply) {
          replyToBiliBili = chatReply;
        }
      }

      fs.writeFileSync(Constants.TTS_FILE_RECV_PATH, `@${danmu.userName} ${replyToBiliBili}`);
      const chatReplyToTTS = await plugins.tts.execute(`吠 ${replyToBiliBili}`);

      //如果语音合成成功的话，直接播放
      if (chatReplyToTTS.content.file) {
        const ttsFile = `${process.cwd()}/static${chatReplyToTTS.content.file}`;
        voicePlayer.play(ttsFile, function (err) {
          if (err) {
            console.log("播放失败：", err);
          }
        });
      }
    });

    live.on("SEND_GIFT", (data) => {
      const gift = data.data;
      console.log(`${gift.uname}送了 ${gift.num} 个 ${gift.giftName}`.log);
    });

    live.on("WELCOME", (data) => {
      const welcome = data.data;
      console.log(`${welcome.uname} 进入直播间`.log);
    });

    live.on("WELCOME_GUARD", (data) => {
      const welcome = data.data;
      console.log(`${welcome.uname} 进入直播间`.log);
    });
  });
}

/**
 * 接入QQ频道
 */
function StartQQGuild() {
  const testConfig = {
    appID: QQ_GUILD_APP_ID, // 申请机器人时获取到的机器人 BotAppID
    token: QQ_GUILD_TOKEN, // 申请机器人时获取到的机器人 BotToken
    intents: ["GUILD_MESSAGES"], // 事件订阅,用于开启可接收的消息类型
    sandbox: true, // 沙箱支持，可选，默认false. v2.7.0+
  };
  const qqGuildClient = createOpenAPI(testConfig);
  const qqGuildWS = createWebsocket(testConfig);

  // 消息监听
  qqGuildWS.on("READY", (data) => {
    console.log("[READY] 事件接收 :", data);
  });
  qqGuildWS.on("ERROR", (data) => {
    console.log("[ERROR] 事件接收 :", data);
  });
  qqGuildWS.on("GUILDS", (data) => {
    console.log("[GUILDS] 事件接收 :", data);
  });
  qqGuildWS.on("GUILD_MEMBERS", (data) => {
    console.log("[GUILD_MEMBERS] 事件接收 :", data);
  });
  qqGuildWS.on("GUILD_MESSAGE_REACTIONS", (data) => {
    console.log("[GUILD_MESSAGE_REACTIONS] 事件接收 :", data);
  });
  qqGuildWS.on("DIRECT_MESSAGE", (data) => {
    console.log("[DIRECT_MESSAGE] 事件接收 :", data);
  });
  qqGuildWS.on("INTERACTION", (data) => {
    console.log("[INTERACTION] 事件接收 :", data);
  });
  qqGuildWS.on("MESSAGE_AUDIT", (data) => {
    console.log("[MESSAGE_AUDIT] 事件接收 :", data);
  });
  qqGuildWS.on("FORUMS_EVENT", (data) => {
    console.log("[FORUMS_EVENT] 事件接收 :", data);
  });
  qqGuildWS.on("AUDIO_ACTION", (data) => {
    console.log("[AUDIO_ACTION] 事件接收 :", data);
  });
  qqGuildWS.on("GUILD_MESSAGES", async (data) => {
    console.log("[GUILD_MESSAGES] 事件接收 :", data);

    //需要把指令前 <@!1234567890 > 和 [sandbox] 移除
    const content = data.msg.content?.replace(/<@!\d+> /g, "").replace(/\[sandbox\]/g, "");

    //QQ频道端插件应答器
    const pluginsReply = await ProcessExecute(
      content,
      data.msg.author.id,
      data.msg.author.username,
      data.msg.channel_id,
      "", //群名暂时还没加
      ""
    );

    if (pluginsReply) {
      const replyToQQGuild = utils.PluginAnswerToQQGuildStyle(pluginsReply);
      const channelID = data.msg.channel_id;
      const replyMsgID = data.msg.id;

      if (replyToQQGuild?.audio) {
        const message = {
          audio_url: replyToQQGuild.audio,
          msg_id: replyMsgID,
          text: replyToQQGuild.text,
          state: Constants.AUDIO_START,
        };

        qqGuildClient.audioApi.postAudio(channelID, message)
          .then((res) => {
            console.log("[GUILD_MESSAGES] 应答成功 :", res);
          })
          .catch((err) => {
            console.log("[GUILD_MESSAGES] 应答失败 :", err);
          });
      } else {
        const message = {
          content: replyToQQGuild?.text ?? "",
          msg_id: replyMsgID,
          image: replyToQQGuild?.image ?? "",
        };

        qqGuildClient.messageApi.postMessage(channelID, message)
          .then((res) => {
            console.log("[GUILD_MESSAGES] 应答成功 :", res.data);
          })
          .catch((err) => {
            console.log("[GUILD_MESSAGES] 应答失败 :", err);
          });
      }

    }
  });

}

/**
 * 更改web端个人资料接口
 */
app.get("/profile", (req, res) => {
  db.run(
    `UPDATE users SET nickname = '${req.query.name}' WHERE CID ='${req.query.CID}'`,
  );
  res.sendFile(process.cwd() + Constants.HTML_PATH);
});

/**
 * web端图片上传接口
 */
app.post("/upload/image", upload.single("file"), function (req, _res, _next) {
  logger.info("用户上传图片".log);
  logger.info(req.file);
  const oldname = req.file.path;
  const newname = req.file.path + path.parse(req.file.originalname).ext;
  fs.renameSync(oldname, newname);
  io.emit("picture", {
    type: "picture", content: `/uploads/${req.file.filename}${path.parse(req.file.originalname).ext}`
  });
});

/**
 * web端文件/视频上传接口
 */
app.post("/upload/file", upload.single("file"), function (req, _res, _next) {
  logger.info("用户上传文件".log);
  logger.info(req.file);
  const oldname = req.file.path;
  const newname = req.file.path + path.parse(req.file.originalname).ext;
  fs.renameSync(oldname, newname);
  const isVideo = new RegExp("^video*");
  const isAudio = new RegExp("^audio*");
  const file = {
    file: `/uploads/${req.file.filename}${path.parse(req.file.originalname).ext}`,
    filename: req.file.originalname,
  };
  if (isVideo.test(req.file.mimetype)) {
    io.emit("video", { type: "video", content: file });
  } else if (isAudio.test(req.file.mimetype)) {
    io.emit("audio", { type: "audio", content: file });
  } else {
    io.emit("file", { type: "file", content: file });
  }
});

/**
 * 读取配置文件 config.yml
 */
function ReadConfig() {
  return new Promise((resolve, reject) => {
    logger.info("开始加载配置……".log);
    fs.readFile(
      path.join(process.cwd(), "config", "config.yml"),
      "utf-8",
      function (err, data) {
        if (!err) {
          logger.info("配置加载完毕√".log);
          resolve(yaml.parse(data));
        } else {
          reject("读取配置文件错误，尝试以默认配置启动。错误原因: " + err);
        }
      },
    );
  });
}

/**
 * 初始化配置
 */
async function InitConfig() {
  const config = await ReadConfig();
  CHAT_SWITCH = config.System.CHAT_SWITCH ?? true;
  CONNECT_GO_CQHTTP_SWITCH = config.System.CONNECT_GO_CQHTTP_SWITCH ?? false;
  CONNECT_BILIBILI_LIVE_SWITCH = config.System.CONNECT_BILIBILI_LIVE_SWITCH ?? false;
  CONNECT_QQ_GUILD_SWITCH = config.System.CONNECT_QQ_GUILD_SWITCH ?? false;
  WEB_PORT = config.System.WEB_PORT ?? 80;
  GO_CQHTTP_SERVICE_ANTI_POST_API = config.System.GO_CQHTTP_SERVICE_ANTI_POST_API ?? "/bot";
  GO_CQHTTP_SERVICE_API_URL = config.System.GO_CQHTTP_SERVICE_API_URL ?? "127.0.0.1:5700";

  QQ_GUILD_APP_ID = config.ApiKey.QQ_GUILD_APP_ID ?? "";
  QQ_GUILD_TOKEN = config.ApiKey.QQ_GUILD_TOKEN ?? "";

  QQBOT_QQ = config.qqBot.QQBOT_QQ; //qqBot使用的qq帐号
  QQBOT_ADMIN_LIST = config.qqBot.QQBOT_ADMIN_LIST; //小夜的管理员列表
  QQ_GROUP_WELCOME_MESSAGE = config.qqBot.QQ_GROUP_WELCOME_MESSAGE; //qq入群欢迎语
  AUTO_APPROVE_QQ_FRIEND_REQUEST_SWITCH = config.qqBot.AUTO_APPROVE_QQ_FRIEND_REQUEST_SWITCH; //自动批准好友请求开关
  QQBOT_PRIVATE_CHAT_SWITCH = config.qqBot.QQBOT_PRIVATE_CHAT_SWITCH; //私聊开关
  CHAT_JIEBA_LIMIT = config.qqBot.CHAT_JIEBA_LIMIT; //qqBot限制分词数量
  QQBOT_REPLY_PROBABILITY = config.qqBot.QQBOT_REPLY_PROBABILITY; //回复几率
  QQBOT_FUDU_PROBABILITY = config.qqBot.QQBOT_FUDU_PROBABILITY; //复读几率
  QQBOT_SAVE_ALL_IMAGE_TO_LOCAL_SWITCH = config.qqBot.QQBOT_SAVE_ALL_IMAGE_TO_LOCAL_SWITCH; //保存接收图片开关
  QQBOT_MAX_MINE_AT_MOST = config.qqBot.QQBOT_MAX_MINE_AT_MOST; //最大共存地雷数

  BILIBILI_LIVE_ROOM_ID = config.Others.BILIBILI_LIVE_ROOM_ID ?? 49148; //哔哩哔哩直播间id

  console.log("_______________________________________\n");
  console.log(`\n|          ${version}           |\n`.alert);

  if (CHAT_SWITCH) {
    logger.info("web端自动聊天开启\n".on);
  } else {
    logger.info("web端自动聊天关闭\n".off);
  }

  /**
   * 启动时请求用户是否开启QQbot
   */
  if (CONNECT_GO_CQHTTP_SWITCH) {
    //先看配置里有没有配置好bot的qq号，没配置就请求输入
    if (!QQBOT_QQ) {
      readLine.question("配置文件中尚未配置小夜的QQ帐号，请在此输入想登录的机器人账号，按回车提交", (answer) => {
        QQBOT_QQ = answer;
        logger.info(`已将小夜的QQ帐号设置为 ${QQBOT_QQ}`.log);
        readLine.close();
      });
    }

    /**
     * 仅在windows系统下自动启动go-cqhttp
     */
    if (process.platform === "win32") {
      ChildProcess.execFile("go-cqhttp.bat", {
        cwd: path.join(process.cwd(), "plugins", "go-cqhttp")
      }, (error, _stdout, _stderr) => {
        if (error) {
          logger.error(`go-cqhttp启动失败，错误原因: ${error}`.error);
          return;
        }
        logger.error("go-cqhttp窗口意外退出，小夜将无法正常使用，请尝试重新启动".error);
        return;
      });
    }

    logger.info(
      `qqBot小夜开启，配置: \n  ·使用QQ帐号 ${QQBOT_QQ}\n  ·对接go-cqhttp接口 ${GO_CQHTTP_SERVICE_API_URL}\n  ·监听反向post于 127.0.0.1:${WEB_PORT}${GO_CQHTTP_SERVICE_ANTI_POST_API}\n  ·私聊服务是否开启: ${QQBOT_PRIVATE_CHAT_SWITCH}\n`
        .on,
    );
    xiaoye_ated = new RegExp(`\\[CQ:at,qq=${QQBOT_QQ}\\]`); //匹配小夜被@
    StartQQBot();
  } else {
    logger.info("小夜关闭\n".off);
  }

  if (CONNECT_BILIBILI_LIVE_SWITCH) {
    logger.info(
      `小夜直播对线开启，请确认哔哩哔哩直播间id是否为 ${BILIBILI_LIVE_ROOM_ID}\n`.on,
    );
    StartLive();
  } else {
    logger.info("小夜直播对线关闭\n".off);
  }

  if (CONNECT_QQ_GUILD_SWITCH) {
    logger.info("小夜QQ频道开启\n".on);
    StartQQGuild();
  } else {
    logger.info("小夜QQ频道关闭\n".off);
  }

  http.listen(WEB_PORT, () => {
    console.log("_______________________________________\n".rainbow);
    logger.info(
      `服务启动完毕，访问 127.0.0.1:${WEB_PORT} 即可查看本地web端\n`,
    );
    logger.info("world.execute(me);".alert);
  });

  /**
   * 检查更新
   */
  axios(
    "https://api.github.com/repos/Giftia/ChatDACS/releases/latest",
  ).then((res) => {
    if (res.data.tag_name !== versionNumber) {
      logger.info(`当前小夜版本 ${versionNumber}，检测到小夜最新版本是 ${res.data.tag_name}，请前往 https://github.com/Giftia/ChatDACS/releases 更新小夜吧`.alert);
    } else {
      logger.info(`当前小夜已经是最新版本 ${versionNumber}`.log);
    }
  }).catch((err) => {
    logger.error(`检查更新失败，错误原因: ${err}`.error);
  });
}

//异步结巴 by@ssp97
async function ChatJiebaFuzzy(msg) {
  msg = msg.replace("/", "");
  msg = jieba.extract(msg, CHAT_JIEBA_LIMIT); //按权重分词
  let candidate = [];
  let candidateNextList = [];
  let candidateNextGrand = 0;
  // console.log("分词出关键词: ".log);
  // console.log(msg);
  //收集数据开始
  for (const key in msg) {
    if (Object.hasOwnProperty.call(msg, key)) {
      const element = msg[key];
      // console.log(element);
      const rows = await utils.sqliteAll(
        "SELECT * FROM chat WHERE ask LIKE '%" + element.word + "%'",
      );
      // console.log(rows);
      for (const k in rows) {
        if (Object.hasOwnProperty.call(rows, k)) {
          const answer = rows[k].answer;
          if (candidate[answer] == undefined) {
            candidate[answer] = 1;
          } else {
            candidate[answer] = candidate[answer] + 1;
          }
        }
      }
    }
  }
  // console.log(candidate);
  // 筛选次数最多
  for (const key in candidate) {
    if (Object.hasOwnProperty.call(candidate, key)) {
      const element = candidate[key];
      if (element > candidateNextGrand) {
        candidateNextList = [];
        candidateNextGrand = element;
        candidateNextList.push(key);
      } else if (element == candidateNextGrand) {
        candidateNextList.push(key);
      }
    }
  }
  // console.log(candidateNextList);
  return candidateNextList;
}

//聊天处理，最核心区块，超智能(智障)的聊天算法: 整句搜索，模糊搜索，分词模糊搜索并轮询
async function ChatProcess(msg) {
  const fullContentSearchAnswer = await new Promise((resolve, _reject) => {
    console.log("开始整句搜索".log);
    db.all("SELECT * FROM chat WHERE ask = '" + msg + "'", (e, sql) => {
      if (!e && sql.length > 0) {
        console.log(`对于整句:  ${msg} ，匹配到 ${sql.length} 条回复`.log);
        let ans = Math.floor(Math.random() * sql.length);
        let answer = JSON.stringify(sql[ans].answer);
        answer = answer.replace(/"/g, "");
        console.log(`随机选取第${ans + 1}条回复: ${answer}`.log);
        resolve(answer);
        return 0;
      } else {
        console.log(`聊天数据库中没有匹配到整句 ${msg} 的回复`.log);
        resolve();
      }
    });
  });

  if (fullContentSearchAnswer) {
    //优先回复整句匹配
    console.log(`返回整句匹配：${fullContentSearchAnswer}`.alert);
    return fullContentSearchAnswer;
  }

  const likeContentSearchAnswer = await new Promise((resolve, _reject) => {
    console.log("开始模糊搜索".log);
    db.all("SELECT * FROM chat WHERE ask LIKE '%" + msg + "%'", (e, sql) => {
      if (!e && sql.length > 0) {
        console.log(`模糊搜索: ${msg} ，匹配到 ${sql.length} 条回复`.log);
        let ans = Math.floor(Math.random() * sql.length);
        let answer = JSON.stringify(sql[ans].answer);
        answer = answer.replace(/"/g, "");
        console.log(`随机选取第${ans + 1}条回复: ${answer}`.log);
        resolve(answer);
        return 0;
      } else {
        console.log(`聊天数据库中没有匹配到 ${msg} 的模糊回复`.log);
        resolve();
      }
    });
  });

  if (likeContentSearchAnswer) {
    //其次是模糊匹配
    console.log(`返回模糊匹配：${likeContentSearchAnswer}`.alert);
    return likeContentSearchAnswer;
  }

  //最后是分词模糊搜索
  console.log("开始分词模糊搜索".log);
  const jiebaCandidateList = await ChatJiebaFuzzy(msg);
  if (jiebaCandidateList.length > 0) {
    const candidateListAnswer = jiebaCandidateList[
      Math.floor(Math.random() * jiebaCandidateList.length)
    ];
    console.log(`返回分词模糊匹配：${candidateListAnswer}`.alert);
    return candidateListAnswer;
  }

  //如果什么回复都没有匹配到，那么随机敷衍
  const randomBalaBala = (await utils.sqliteAll("SELECT * FROM balabala ORDER BY RANDOM()"))[0].balabala;
  console.log(`返回随机敷衍：${randomBalaBala}`.alert);
  return randomBalaBala;
}

//浓度极高的ACGN圈台词问答题库
function ECYWenDa() {
  return new Promise((resolve, _reject) => {
    request(
      "https://api.oddfar.com/yl/q.php?c=2001&encode=json",
      (err, _response, body) => {
        body = JSON.parse(body);
        if (!err) {
          const msg = jieba.extract(body.text, CHAT_JIEBA_LIMIT); //按权重分词
          if (msg.length == 0) {
            //如果分词不了，那就直接夜爹牛逼
            resolve({
              quest: "啊噢，出不出题了，你直接回答 夜爹牛逼 吧",
              result: "夜爹牛逼",
            });
            return 0;
          }
          let rand_word_num = Math.floor(Math.random() * msg.length);
          let answer = msg[rand_word_num].word;
          logger.info(
            `原句为: ${body.text}，随机切去第 ${rand_word_num + 1} 个关键词 ${answer} 作为答案`.log,
          );
          let quest = body.text.replace(answer, "________");
          resolve({ quest: quest, result: answer });
        } else {
          resolve({
            quest: "啊噢，出不出题了，你直接回答 夜爹牛逼 吧",
            result: "夜爹牛逼",
          });
        }
      },
    );
  });
}

//插件系统核心
async function ProcessExecute(msg, userId, userName, groupId, groupName, options) {
  let pluginReturn = "";
  for (const i in plugins) {
    const reg = new RegExp(plugins[i].指令);
    if (reg.test(msg)) {
      try {
        pluginReturn = await plugins[i].execute(msg, userId, userName, groupId, groupName, options);
      } catch (e) {
        logger.error(
          `插件 ${plugins[i].插件名} ${plugins[i].版本} 爆炸啦: ${e.stack}`.error,
        );
        return `插件 ${plugins[i].插件名} ${plugins[i].版本} 爆炸啦: ${e.stack}`;
      }
      if (pluginReturn) {
        logger.info(
          `插件 ${plugins[i].插件名} ${plugins[i].版本} 响应了消息：`.log,
        );
        logger.info(JSON.stringify(pluginReturn).log);
        return pluginReturn;
      }
    }
  }
  return pluginReturn;
}

/**
 * 我正在听：🎧 雾里 —— 姚六一
 */
