// Deno HTTP 服务器 - 监听 ESPHome NFC 卡片播放器事件
// 运行方式: deno run --allow-net --allow-run music-server.ts

import { MusicData } from "./music-data.ts";

interface NFCCardInsertedEvent {
  event: "nfc_card_inserted";
  uid: string;
}

interface NFCCardRemovedEvent {
  event: "nfc_card_removed";
  message: string;
}

type NFCEvent = NFCCardInsertedEvent | NFCCardRemovedEvent;

// 存储当前卡片状态
let currentCardUID: string | null = null;
// 存储上一次播放的卡片 UID，用于避免重复播放
let lastPlayedCardUID: string | null = null;

// 播放音乐
async function playMusic(type: string, value: string) {
  try {
    console.log(`🎶 开始播放: ${type} - ${value}`);
    
    const command = new Deno.Command("/usr/bin/osascript", {
      args: [
        "./play_apple_music.applescript",
        type,
        value
      ],
    });

    const { code, stdout, stderr } = await command.output();
    
    if (code === 0) {
      console.log("✅ 音乐播放成功");
    } else {
      const errorMessage = new TextDecoder().decode(stderr);
      console.error(`❌ 音乐播放失败: ${errorMessage}`);
    }
  } catch (error) {
    console.error(`❌ 执行 AppleScript 出错:`, error);
  }
}

// 处理 NFC 卡片插入事件
async function handleCardInserted(id: string) {
  currentCardUID = id;
  console.log(`🎵 卡片已插入 - UID: ${id}`);
  console.log(`时间: ${new Date().toLocaleString("zh-CN")}`);
  
  // 检查是否与上一次播放的卡片相同
  if (lastPlayedCardUID === id) {
    console.log(`🔁 检测到重复卡片，跳过播放 (UID: ${id})`);
    return;
  }
  
  // 根据 UID 查找音乐数据
  const musicItem = MusicData.find(item => item.id === id);
  
  if (musicItem) {
    console.log(`📀 找到音乐: ${musicItem.name}`);
    console.log(`类型: ${musicItem.type}, 值: ${musicItem.value}`);
    
    // 调用 AppleScript 播放音乐
    await playMusic(musicItem.type, musicItem.value);
    
    // 记录本次播放的卡片 UID
    lastPlayedCardUID = id;
  } else {
    console.log(`⚠️  未找到 UID 对应的音乐: ${id}`);
  }
}

// 停止音乐
async function stopMusic() {
  try {
    console.log(`⏹️  停止播放音乐`);
    lastPlayedCardUID = null;
    
    // 使用 AppleScript 停止 Music 应用的播放
    const command = new Deno.Command("/usr/bin/osascript", {
      args: [
        "-e",
        'tell application "Music" to stop'
      ],
    });

    const { code, stdout, stderr } = await command.output();
    
    if (code === 0) {
      console.log("✅ 音乐已停止");
    } else {
      const errorMessage = new TextDecoder().decode(stderr);
      console.error(`❌ 停止音乐失败: ${errorMessage}`);
    }
  } catch (error) {
    console.error(`❌ 执行 AppleScript 出错:`, error);
  }
}

// 处理 NFC 卡片移除事件
async function handleCardRemoved(message: string) {
  const previousUID = currentCardUID;
  currentCardUID = null;
  console.log(`⏹️  卡片已移除`);
  console.log(`消息: ${message}`);
  console.log(`之前的 UID: ${previousUID || "无"}`);
  console.log(`时间: ${new Date().toLocaleString("zh-CN")}`);
  
  // 停止音乐播放
  await stopMusic();
}

// 处理 HTTP 请求
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  // 日志记录请求信息
  console.log(`\n--- 收到请求 ---`);
  console.log(`方法: ${req.method}`);
  console.log(`路径: ${url.pathname}`);
  console.log(`时间: ${new Date().toLocaleString("zh-CN")}`);
  
  // 处理 POST 请求
  if (req.method === "POST") {
    try {
      const body = await req.json() as NFCEvent;
      console.log(`请求体:`, body);
      
      // 根据事件类型处理
      if (body.event === "nfc_card_inserted") {
        // 异步处理，不阻塞响应
        handleCardInserted(body.uid).catch(err => {
          console.error("处理卡片插入事件时出错:", err);
        });
        return new Response(
          JSON.stringify({ 
            status: "success", 
            message: "卡片已识别",
            uid: body.uid 
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      } else if (body.event === "nfc_card_removed") {
        // 异步处理，不阻塞响应
        handleCardRemoved(body.message).catch(err => {
          console.error("处理卡片移除事件时出错:", err);
        });
        return new Response(
          JSON.stringify({ 
            status: "success", 
            message: "卡片移除已处理" 
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({ 
            status: "error", 
            message: "未知的事件类型" 
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      console.error("❌ 解析请求失败:", error);
      return new Response(
        JSON.stringify({ 
          status: "error", 
          message: "无效的 JSON 格式" 
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }
  
  // 处理 GET 请求 - 返回服务器状态
  if (req.method === "GET" && url.pathname === "/") {
    return new Response(
      JSON.stringify({
        status: "running",
        message: "NFC 卡片播放器服务器正在运行",
        currentCard: currentCardUID,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  
  // 其他请求返回 404
  return new Response(
    JSON.stringify({ 
      status: "error", 
      message: "未找到该路径" 
    }),
    {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }
  );
}

// 启动服务器
const PORT = 5566;
console.log(`🚀 音乐服务器启动中...`);
console.log(`📡 监听端口: ${PORT}`);
console.log(`🌐 访问地址: http://localhost:${PORT}`);
console.log(`⏰ 启动时间: ${new Date().toLocaleString("zh-CN")}`);
console.log(`\n等待 NFC 卡片事件...\n`);

Deno.serve({ port: PORT }, handleRequest);

