// index.js
const { channel } = require('diagnostics_channel');
const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    PermissionsBitField,
    Events,
    REST,
    Routes,
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    ActionRowBuilder,
    PermissionFlagsBits,
    isEquatable,
    InteractionResponse,
    PresenceUpdateStatus,
    ActivityType,
    MessageFlags,
    ButtonBuilder,
    AttachmentBuilder,
    ButtonStyle,
    embedLength,
    messageLink,
  } = require('discord.js');
  const fs = require('fs').promises;
  const fsSync = require('fs');
  const path = require('path');
  require('dotenv').config();
  const request = require('request');
  
  // 환경 변수 설정
  const TOKEN = process.env.TOKEN;
  const CLIENT_ID = process.env.CLIENT_ID;
  const prefix = process.env.PREFIX || '!'; // Add this line
  let debugtogle = false;
  const is_bad = /\[.+?\]\((<)?https?:(?:\/\/)?(?:[a-zA-Z0-9.\-]+(?:\.[a-zA-Z]{2,6})*)(?:[\/\w .~!$'()*-]*)\/?(>)?\)/;
  const DB_DIR = './DB';
  const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
  const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
  
  // 클라이언트 생성 및 필요한 인텐트 설정
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message]
  });
  
const botallowlist = [
  "1375992606290608209", // SH 봇 dev
  "1326945258394615880", // 블랙리스트
  "1240283015213617202", // 청아
  "1372938816821792879", // SH 봇
];

  // 메모리 내 봇 상태 저장용 데이터 (캐시 역할)
  const guildSettings = new Map();
  
  // { guildId: timeoutId, ... } 형태로 setTimeout 타이머 ID를 저장할 객체 (메모리 내)
  const activeScheduledDeletions = {};
  
  // 1일 (24시간 * 60분 * 60초 * 1000밀리초)
  const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
  // const ONE_DAY_IN_MS = 5 * 1000; // 테스트를 위해 5초로 설정할 수도 있습니다.
  /** */
    // 여기! activeCaptchas Map을 선언합니다.
const activeCaptchas = new Map(); // 이 줄을 추가하거나, 기존 선언 위치를 이리로 옮깁니다.

// 서버별 캡차 설정을 불러오고 저장하는 함수
async function getGuildCaptchaSetting(guildId) {
  const guildDbPath = `${DB_DIR}/${guildId}/setting.json`;
  try {
      const data = await fs.readFile(guildDbPath, 'utf8');
      return JSON.parse(data);
  } catch (error) {
      if (error.code === 'ENOENT') { // 파일이 없을 경우
          console.log(`Setting file not found for guild ${guildId}. Returning default.`);
          return {}; // 기본 빈 객체 반환
      }
      console.error(`Error reading setting file for guild ${guildId}:`, error);
      return {}; // 에러 발생 시에도 기본값 반환
  }
}

async function saveGuildCaptchaSetting(guildId, settings) {
  const guildDirPath = `${DB_DIR}/${guildId}`;
  const guildDbPath = `${guildDirPath}/setting.json`;
  try {
      await fs.mkdir(guildDirPath, { recursive: true }); // 디렉토리가 없으면 생성
      await fs.writeFile(guildDbPath, JSON.stringify(settings, null, 2), 'utf8');
      console.log(`Settings saved for guild ${guildId}.`);
  } catch (error) {
      console.error(`Error saving setting file for guild ${guildId}:`, error);
  }
}

  /**
   * @param {string} title - 임베드의 제목
   * @param {string} description - 임베드의 설명
   * @param {string} fields - 임베드의 필드( {name: "", value: "", inline: boolean} )
   * @param {boolean} timestamp - 임베드의 타임스템프 여부
   * @param {string} footer - 임베드의 footer
   * @param {string} author - 임베드의 author
   * @returns {object}  임베드
   */
  async function createembed(title,description,timestamp,fields=null,footer=null,author=null) {
    if (!fields){
      const embed = await new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setAuthor(author)
      .setFooter(footer)
      .setTimestamp(timestamp?Date.now():null)
      return embed
    }
    const embed = await new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setAuthor(author)
    .setFooter(footer)
    .setTimestamp(timestamp?Date.now():null)
    .addFields(fields)
  } 

  /**
   * 특정 길드 ID에 해당하는 폴더의 deletetimer.json 파일 경로를 반환합니다.
   * @param {string} guildId - 길드 ID
   * @returns {string} - deletetimer.json 파일 경로
   */
  function getTimerFilePath(guildId) {
      return path.join(__dirname, 'DB', guildId, 'deletetimer.json');
  }
  
  /**
   * 특정 길드 ID에 해당하는 폴더를 일정 시간 뒤에 삭제하도록 예약합니다.
   * 예약 정보를 `deletetimer.json` 파일에 저장합니다.
   * @param {string} guildId - 삭제할 길드 폴더의 ID
   * @param {number} [delayMs=ONE_DAY_IN_MS] - 삭제될 때까지의 지연 시간 (밀리초), 기본값 1일
   * @returns {Promise<number | string>} - 예약된 타이머의 ID (성공 시) 또는 오류 메시지 문자열 (실패 시)
   */
  async function scheduleGuildFolderDeletion(guildId, delayMs = ONE_DAY_IN_MS) {
      const folderPath = path.join(__dirname, 'DB', guildId);
      const timerFilePath = getTimerFilePath(guildId);
  
      // 1. 메모리 내에 이미 예약된 것이 있다면 오류 메시지 반환
      if (activeScheduledDeletions[guildId]) {
          return `길드 ${guildId} 폴더에 대한 삭제 예약이 이미 메모리에 존재합니다.`;
      }
  
      // 2. 파일 시스템에 이미 예약 파일이 있는지 확인
      try {
          await fs.access(timerFilePath);
          // 파일이 존재한다면, 이미 예약된 것으로 간주하고 오류 반환
          return `길드 ${guildId} 폴더에 대한 삭제 예약이 'deletetimer.json' 파일에 이미 존재합니다.`;
      } catch (err) {
          // 파일이 존재하지 않는 경우 (err.code === 'ENOENT'), 정상적으로 진행
          if (err.code !== 'ENOENT') {
              console.error(`[ERROR] deletetimer.json 파일 접근 중 알 수 없는 오류:`, err);
              return `삭제 예약 확인 중 시스템 오류가 발생했습니다: ${err.message}`;
          }
      }
  
      console.log(`[INFO] 길드 ${guildId} 폴더 (${folderPath}) 삭제를 ${delayMs / 1000}초 뒤로 예약했습니다.`);
  
      // 삭제될 시간 계산
      const deletionTime = Date.now() + delayMs;
  
      const timerId = setTimeout(async () => {
          try {
              // 폴더 존재 여부 확인 (삭제 전에 확인하여 불필요한 오류 방지)
              const exists = await fs.access(folderPath)
                  .then(() => true)
                  .catch(() => false);
  
              if (exists) {
                  await fs.rm(folderPath, { recursive: true, force: true });
                  console.log(`[SUCCESS] 길드 ${guildId} 폴더 (${folderPath}) 및 모든 하위 내용이 성공적으로 삭제되었습니다.`);
                  const guild = await client.guilds.fetch(guildId);
                  await guild.leave();
              } else {
                  console.log(`[INFO] 길드 ${guildId} 폴더 (${folderPath})가 이미 존재하지 않아 삭제를 건너뛰었습니다.`);
              }
          } catch (error) {
              console.error(`[ERROR] 길드 ${guildId} 폴더 (${folderPath}) 삭제 중 오류 발생:`, error);
          } finally {
              // 메모리 내 예약 목록에서 제거
              delete activeScheduledDeletions[guildId];
              // deletetimer.json 파일 삭제 (실패해도 상관 없음)
              await fs.unlink(timerFilePath).catch(() => {});
          }
      }, delayMs);
  
      activeScheduledDeletions[guildId] = timerId;
  
      // 예약 정보를 JSON 파일에 저장
      try {
          // 길드 폴더가 없으면 먼저 생성
          await fs.mkdir(folderPath, { recursive: true });
          await fs.writeFile(timerFilePath, JSON.stringify({
              guildId: guildId,
              scheduledFor: deletionTime,
              // (선택 사항) originalDelay: delayMs // 지연 시간을 기록하고 싶다면
          }, null, 2));
          console.log(`[INFO] 예약 정보가 ${timerFilePath}에 저장되었습니다.`);
      } catch (fileError) {
          console.error(`[ERROR] 예약 정보를 ${timerFilePath}에 저장 중 오류 발생:`, fileError);
          // 파일 저장 실패 시 타이머 취소 및 메모리에서도 제거 (선택 사항, 정책에 따라 다름)
          clearTimeout(timerId);
          delete activeScheduledDeletions[guildId];
          return `삭제 예약 저장 중 오류 발생: ${fileError.message}`;
      }
  
      return timerId;
  }
  
  /**
   * 예약된 길드 폴더 삭제를 취소합니다.
   * 메모리 내 타이머를 취소하고 `deletetimer.json` 파일을 삭제합니다.
   * @param {string} guildId - 취소할 길드 폴더의 ID
   * @returns {Promise<boolean>} - 취소 성공 여부 (true: 취소됨, false: 예약된 것이 없거나 이미 실행됨)
   */
  async function cancelGuildFolderDeletion(guildId) {
      const timerFilePath = getTimerFilePath(guildId);
      let wasActive = false;
  
      // 1. 메모리 내 타이머 취소
      if (activeScheduledDeletions[guildId]) {
          clearTimeout(activeScheduledDeletions[guildId]);
          delete activeScheduledDeletions[guildId];
          wasActive = true;
          console.log(`[INFO] 길드 ${guildId} 폴더 삭제 예약이 메모리에서 취소되었습니다.`);
      }
  
      // 2. deletetimer.json 파일 삭제
      try {
          await fs.unlink(timerFilePath);
          console.log(`[INFO] ${timerFilePath} 파일이 삭제되었습니다.`);
          return true; // 파일이 존재하여 삭제되었으면 성공으로 간주
      } catch (err) {
          // 파일이 존재하지 않는 경우 (ENOENT)는 정상적인 경우
          if (err.code === 'ENOENT') {
              if (wasActive) {
                  // 메모리에는 있었지만 파일은 없었던 경우 (예: 수동 삭제)
                  console.log(`[INFO] ${timerFilePath} 파일은 이미 존재하지 않습니다.`);
                  return true; // 메모리에서 취소되었으니 성공
              } else {
                  console.log(`[INFO] 길드 ${guildId} 폴더에 대한 예약된 삭제가 없습니다 (메모리 및 파일).`);
                  return false;
              }
          } else {
              console.error(`[ERROR] ${timerFilePath} 파일 삭제 중 오류 발생:`, err);
              return false;
          }
      }
  }
  
  /**
   * 애플리케이션 시작 시, 저장된 예약 정보들을 로드하여 타이머를 재설정합니다.
   */
  async function loadScheduledDeletions() {
      const dbFolderPath = path.join(__dirname, 'DB');
      console.log(`[INFO] '${dbFolderPath}'에서 기존 삭제 예약을 로드합니다.`);
  
      try {
          await fs.access(dbFolderPath); // DB 폴더 존재 여부 확인
      } catch (err) {
          if (err.code === 'ENOENT') {
              console.log(`[INFO] DB 폴더가 존재하지 않아 로드할 예약이 없습니다.`);
              return;
          }
          console.error(`[ERROR] DB 폴더 접근 중 오류 발생:`, err);
          return;
      }
  
      const guildFolders = await fs.readdir(dbFolderPath, { withFileTypes: true });
  
      for (const dirent of guildFolders) {
          if (dirent.isDirectory()) {
              const guildId = dirent.name;
              const timerFilePath = getTimerFilePath(guildId);
  
              try {
                  const data = await fs.readFile(timerFilePath, 'utf8');
                  const timerInfo = JSON.parse(data);
  
                  // 유효성 검사 (기본적인)
                  if (timerInfo && timerInfo.guildId === guildId && typeof timerInfo.scheduledFor === 'number') {
                      const remainingTime = timerInfo.scheduledFor - Date.now();
  
                      if (remainingTime > 0) {
                          console.log(`[INFO] 길드 ${guildId}에 대한 기존 예약 (${remainingTime / 1000}초 남음)을 재설정합니다.`);
                          // scheduleGuildFolderDeletion 함수를 재사용하지 않고, 내부 로직만 가져옴
                          // 왜냐하면 scheduleGuildFolderDeletion은 "새로운" 예약에 대한 오류를 반환하기 때문
                          const folderPath = path.join(__dirname, 'DB', guildId);
  
                          const timerId = setTimeout(async () => {
                              try {
                                  const exists = await fs.access(folderPath)
                                      .then(() => true)
                                      .catch(() => false);
  
                                  if (exists) {
                                      await fs.rm(folderPath, { recursive: true, force: true });
                                      console.log(`[SUCCESS] (로드된 예약) 길드 ${guildId} 폴더 (${folderPath}) 및 모든 하위 내용이 성공적으로 삭제되었습니다.`);
                                  } else {
                                      console.log(`[INFO] (로드된 예약) 길드 ${guildId} 폴더 (${folderPath})가 이미 존재하지 않아 삭제를 건너뛰었습니다.`);
                                  }
                              } catch (error) {
                                  console.error(`[ERROR] (로드된 예약) 길드 ${guildId} 폴더 (${folderPath}) 삭제 중 오류 발생:`, error);
                              } finally {
                                  delete activeScheduledDeletions[guildId];
                                  await fs.unlink(timerFilePath).catch(() => {});
                              }
                          }, remainingTime);
  
                          activeScheduledDeletions[guildId] = timerId;
  
                      } else {
                          console.log(`[INFO] 길드 ${guildId}에 대한 예약이 이미 만료되었습니다. 즉시 삭제를 시도합니다.`);
                          // 이미 만료된 경우 즉시 삭제
                          await fs.rm(path.join(dbFolderPath, guildId), { recursive: true, force: true }).catch(err => {
                              console.error(`[ERROR] 만료된 길드 ${guildId} 폴더 즉시 삭제 중 오류:`, err);
                          });
                          await fs.unlink(timerFilePath).catch(() => {}); // 타이머 파일도 삭제
                      }
                  } else {
                      console.warn(`[WARNING] ${timerFilePath} 파일의 형식이 올바르지 않아 무시합니다.`);
                      await fs.unlink(timerFilePath).catch(() => {}); // 유효하지 않은 파일 삭제
                  }
              } catch (err) {
                  // deletetimer.json 파일이 없거나 읽을 수 없는 경우 (ENOENT는 무시)
                  if (err.code !== 'ENOENT') {
                      console.error(`[ERROR] ${timerFilePath} 파일 로드 중 오류 발생:`, err);
                  }
              }
          }
      }
      console.log(`[INFO] 기존 예약 로드 완료.`);
  }
  async function getnclient() {
clients = [
  {"id":"ujiyEbF9Y3uMLW1gr2aE","pw":"oIsLkS1E1E"},
  {"id":NAVER_CLIENT_ID,"pw":NAVER_CLIENT_SECRET}
]
return await clients[Math.floor(Math.random() * clients.length)];
}  // Ensure DB directory exists
function ensureDirectoryExists(directory) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
  }
  
  // Get user warnings data
  function getUserWarnings(guildId, userId) {
    const userDbPath = path.join(__dirname, 'DB', guildId, `${userId}.json`);
    
    // Check if file exists
    if (fsSync.existsSync(userDbPath)) {
      try {
        const data = fsSync.readFileSync(userDbPath, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        console.error(`Error reading user warning data: ${error}`);
        return { warnings: [], totalWarnings: 0 };
      }
    } else {
      return { warnings: [], totalWarnings: 0 };
    }
  }
  
  // Save user warnings data
  function saveUserWarnings(guildId, userId, data) {
    const guildDir = path.join(__dirname, 'DB', guildId);
    ensureDirectoryExists(guildDir);
    
    const userDbPath = path.join(guildDir, `${userId}.json`);
    
    try {
      fsSync.writeFileSync(userDbPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Error saving user warning data: ${error}`);
    }
  }
  
  // Add warning to user
  function addWarning(guildId, userId, moderatorId, count, reason) {
    const userData = getUserWarnings(guildId, userId);
    
    userData.warnings.push({
      warn: count,
      reason: reason,
      user: moderatorId,
      timestamp: Date.now()
    });
    
    userData.totalWarnings = (userData.totalWarnings || 0) + count;
    
    saveUserWarnings(guildId, userId, userData);
    return userData;
  }
  
  // Remove warning from user
  function removeWarning(guildId, userId, moderatorId, count, reason) {
    const userData = getUserWarnings(guildId, userId);
    
    userData.warnings.push({
      warn: -count, // Negative value to indicate removal
      reason: reason,
      user: moderatorId,
      timestamp: Date.now()
    });
    
    userData.totalWarnings = Math.max(0, (userData.totalWarnings || 0) - count);
    
    saveUserWarnings(guildId, userId, userData);
    return userData;
  }
  
  // Handle warn add command
  async function handleWarnAdd(interaction, user, count, reason, warningMessage) {
    // Check permissions
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return replyToCommand(interaction, '이 명령어를 사용할 권한이 없습니다.');
    }
    
    const guildId = interaction.guild.id;
    const userId = user.id;
    const moderatorId = interaction.user.id;
    
    const userData = addWarning(guildId, userId, moderatorId, count, reason);
    
    const embed = new EmbedBuilder()
      .setTitle('⚠️ 경고 지급')
      .setColor('#FF5555')
      .setDescription(`<@${userId}> 님에게 경고가 ${count}개 지급되었습니다.`)
      .addFields(
        { name: '사유', value: reason || '사유 없음', inline: false },
        { name: '현재 경고 수', value: `${userData.totalWarnings}개`, inline: true },
        { name: '처리자', value: `<@${moderatorId}>`, inline: true }
      )
      .setTimestamp();
    
    await replyToCommand(interaction, { embeds: [embed] });
    
    // Send warning message to the user if provided
    if (warningMessage) {
      try {
        const targetMember = await interaction.guild.members.fetch(userId);
        await targetMember.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(`⚠️ ${interaction.guild.name} 서버에서 경고를 받았습니다`)
              .setColor('#FF5555')
              .setDescription(warningMessage)
              .addFields(
                { name: '사유', value: reason || '사유 없음', inline: false },
                { name: '경고 수', value: `${count}개 (총 ${userData.totalWarnings}개)`, inline: true }
              )
              .setTimestamp()
          ]
        });
      } catch (error) {
        console.error(`Failed to send DM to user: ${error}`);
      }
    }
  }
  
  // Handle warn remove command
  async function handleWarnRemove(interaction, user, count, reason) {
    // Check permissions
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return replyToCommand(interaction, '이 명령어를 사용할 권한이 없습니다.');
    }
    
    const guildId = interaction.guild.id;
    const userId = user.id;
    const moderatorId = interaction.user.id;
    
    const userData = removeWarning(guildId, userId, moderatorId, count, reason);
    
    const embed = new EmbedBuilder()
      .setTitle('✅ 경고 차감')
      .setColor('#55FF55')
      .setDescription(`<@${userId}> 님의 경고가 ${count}개 차감되었습니다.`)
      .addFields(
        { name: '사유', value: reason || '사유 없음', inline: false },
        { name: '현재 경고 수', value: `${userData.totalWarnings}개`, inline: true },
        { name: '처리자', value: `<@${moderatorId}>`, inline: true }
      )
      .setTimestamp();
    
    await replyToCommand(interaction, { embeds: [embed] });
  }
  
  // Handle warn check command
  async function handleWarnCheck(interaction, user) {
    const guildId = interaction.guild.id;
    const userId = user.id;
    
    const userData = getUserWarnings(guildId, userId);
    
    const embed = new EmbedBuilder()
      .setTitle('📋 경고 기록')
      .setColor('#5555FF')
      .setDescription(`<@${userId}> 님의 경고 기록입니다.`)
      .addFields(
        { name: '총 경고 수', value: `${userData.totalWarnings || 0}개`, inline: false }
      )
      .setTimestamp();
    
    // Add recent warning history (up to 10 entries)
    const recentWarnings = userData.warnings.slice(-10).reverse(); // Get last 10 warnings and reverse for chronological order
    
    if (recentWarnings.length > 0) {
      let historyText = '';
      
      recentWarnings.forEach((warning, index) => {
        const date = new Date(warning.timestamp || Date.now());
        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        
        if (warning.warn > 0) {
          historyText += `${index + 1}. [${formattedDate}] +${warning.warn}개 - ${warning.reason ? warning.reason : "사유없음"} (by <@${warning.user}>)\n`;
        } else {
          historyText += `${index + 1}. [${formattedDate}] ${warning.warn}개 - ${warning.reason ? warning.reason : "사유없음"} (by <@${warning.user}>)\n`;
        }
      });
      
      embed.addFields({ name: '최근 기록', value: historyText || '기록 없음', inline: false });
    }
    
    await replyToCommand(interaction, { embeds: [embed] });
  }
  
  // Unified reply function that works for both slash commands and message commands
  function replyToCommand(interaction, response) {
    if (interaction.reply) {
      // It's a slash command interaction
      if (interaction.deferred || interaction.replied) {
        return interaction.followUp(response);
      }
      return interaction.reply(response);
    } else {
      // It's a message command
      return interaction.channel.send(response);
    }
  }
  // 로그 함수 정의
  function log(guildId, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    // 디렉토리 경로 생성
    const guildDir = path.join('./DB', guildId);
    ensureDirectoryExists(guildDir);
    
    // 로그 파일에 추가
    fsSync.appendFile(path.join(guildDir, 'log.log'), logMessage, err => {
      if (err) console.error('로그 파일 쓰기 오류:', err);
    });
    
    // 콘솔에도 출력
    console.log(`[Guild: ${guildId}] ${message}`);
  }
  
  // 설정 저장 함수
  function saveSettings(guildId, settings) {
    try {
      // 디렉토리 생성 확인
      const guildDir = path.join('./DB', guildId);
      ensureDirectoryExists(guildDir);
      
      // 설정 파일 저장
      fsSync.writeFileSync(
        path.join(guildDir, 'setting.json'), 
        JSON.stringify(settings, null, 2)
      );
      
      // 메모리 캐시에도 저장
      guildSettings.set(guildId, settings);
      
      log(guildId, '설정이 저장되었습니다.');
      return true;
    } catch (error) {
      log(guildId, `설정 저장 중 오류 발생: ${error.message}`);
      return false;
    }
  }
  
  // 설정 로드 함수
  function loadSettings(guildId) {
    try {
      const settingPath = path.join('./DB', guildId, 'setting.json');
      
      // 파일이 존재하는지 확인
      if (fsSync.existsSync(settingPath)) {
        // 파일에서 설정 로드
        const data = fsSync.readFileSync(settingPath, 'utf8');
        const settings = JSON.parse(data);
        
        // 메모리 캐시에도 저장
        guildSettings.set(guildId, settings);
        
        log(guildId, '설정을 로드했습니다.');
        return settings;
      } else {
        // 설정 파일이 없으면 기본 설정 생성
        const defaultSettings = {};
        guildSettings.set(guildId, defaultSettings);
        return defaultSettings;
      }
    } catch (error) {
      log(guildId, `설정 로드 중 오류 발생: ${error.message}`);
      return {};
    }
  }
  
  // 디렉토리 존재 확인 함수
  function ensureDirectoryExists(dirPath) {
    if (!fsSync.existsSync(dirPath)) {
      fsSync.mkdirSync(dirPath, { recursive: true });
    }
  }
  async function tempbanMember(guild, member, time, unit, reason, moderator) {
    let banDuration;
    switch (unit) {
      case '초':
        banDuration = time * 1000;
        break;
      case '분':
        banDuration = time * 60 * 1000;
        break;
      case '시간':
        banDuration = time * 60 * 60 * 1000;
        break;
      case '일':
        banDuration = time * 24 * 60 * 60 * 1000;
        break;
      default:
        return '유효하지 않은 시간 단위입니다.';
    }
  
    try {
      await member.ban({ reason: `${moderator.tag} 님이 임시 차단: ${reason}, 해제시각(차단시각 기준): ${time}${unit} 후` });
      const replyMessage = `${member.user.tag} 님을 ${time}${unit} 동안 임시 차단했습니다. 사유: ${reason}`;
      console.log(replyMessage);
  
      // 차단 해제
      setTimeout(async () => {
        try {
          await guild.members.unban(member.id, '임시 차단 해제');
          console.log(`${member.user.tag} 님의 임시 차단이 해제되었습니다.`);
          const unbanEmbed = {
            color: 0x00ff00,
            title: '임시 차단 해제',
            description: `${member.user.tag} 님의 임시 차단이 자동으로 해제되었습니다.`,
            timestamp: new Date(),
          };
          const channel = guild.channels.cache.get(guild.systemChannelId); // 시스템 채널에 알림 (원하는 채널로 변경 가능)
          if (channel && channel.isText()) {
            channel.send({ embeds: [unbanEmbed] });
          }
        } catch (error) {
          console.error('임시 차단 해제 중 오류 발생:', error);
        }
      }, banDuration);
  
      return replyMessage;
  
    } catch (error) {
      console.error('멤버 차단 중 오류 발생:', error);
      return '멤버를 차단하는 데 실패했습니다. 권한을 확인해주세요.';
    }
  }
  /**
   * @parm {}
   */
  function timetosec(time,unit){

      let banDuration;
      switch (unit) {
        case '초':
          banDuration = time * 1000;
          break;
        case '분':
          banDuration = time * 60 * 1000;
          break;
        case '시간':
          banDuration = time * 60 * 60 * 1000;
          break;
        case '일':
          banDuration = time * 24 * 60 * 60 * 1000;
          break;
        default:
          return '유효하지 않은 시간 단위입니다.';
      }
      const timeoutdur =banDuration;
      return timeoutdur;
        member.timeout({timeoutdur , reason: `${moderator.tag} 님이 타임아웃: ${reason}, 해제시각(차단시각 기준): ${time}${unit} 후` });
        const replyMessage = `${member.user.tag} 님을 ${time}${unit} 동안 타임아웃했습니다. 사유: ${reason}`;
        console.log(replyMessage);
        return replyMessage;
  }

  /**
 * 봇이 참여하고 있는 모든 길드의 총 유저 수를 계산합니다.
 * @param {Client} client - Discord.js Client 객체
 * @returns {number} - 모든 길드의 총 유저 수
 */
function getTotalMemberCount(client) {
  let totalMembers = 0;

  // client.guilds.cache는 봇이 접근할 수 있는 모든 길드의 컬렉션입니다.
  // 각 길드의 memberCount 속성을 더합니다.
  client.guilds.cache.forEach(guild => {
      totalMembers += guild.memberCount;
  });

  return totalMembers;
}

// 슬래시 커맨드 정의
const commands = [
  new SlashCommandBuilder()
    .setName('핑')
    .setDescription('봇의 응답 지연 시간을 확인합니다.'),
  
  new SlashCommandBuilder()
    .setName('경고')
    .setDescription('경고 관리 시스템')
    .addSubcommand(subcommand =>
      subcommand
        .setName('지급')
        .setDescription('사용자에게 경고 지급')
        .addUserOption(option => 
          option.setName('유저')
            .setDescription('경고를 지급할 유저')
            .setRequired(true)
        )
        .addIntegerOption(option => 
          option.setName('개수')
            .setDescription('경고 개수')
            .setRequired(true)
        )
        .addStringOption(option => 
          option.setName('사유')
            .setDescription('경고 사유')
            .setRequired(false)
        )
        .addStringOption(option => 
          option.setName('경고메세지')
            .setDescription('추가 경고 메시지')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('차감')
        .setDescription('사용자의 경고 차감')
        .addUserOption(option => 
          option.setName('유저')
            .setDescription('경고를 차감할 유저')
            .setRequired(true)
        )
        .addIntegerOption(option => 
          option.setName('개수')
            .setDescription('차감할 경고 개수')
            .setRequired(true)
        )
        .addStringOption(option => 
          option.setName('사유')
            .setDescription('차감 사유')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('확인')
        .setDescription('사용자의 경고 확인')
        .addUserOption(option => 
          option.setName('유저')
            .setDescription('경고를 확인할 유저')
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('유저를 지정된 시간 동안 임시 차단합니다.')
    .addUserOption(option =>
      option.setName('유저')
        .setDescription('임시 차단할 유저를 선택하세요.')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('시간')
        .setDescription('차단할 시간을 입력하세요.')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('단위')
        .setDescription('시간 단위를 선택하세요.')
        .addChoices(
          { name: '초', value: '초' },
          { name: '분', value: '분' },
          { name: '시간', value: '시간' },
          { name: '일', value: '일' },
        )
        .setRequired(true))
    .addStringOption(option =>
      option.setName('사유')
        .setDescription('차단 사유를 입력하세요 (선택 사항).')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),

    new SlashCommandBuilder()
    .setName('밴')
    .setDescription('유저를 차단합니다.')
    .addUserOption(option =>
      option.setName('유저')
        .setDescription('차단할 유저를 선택하세요.')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('사유')
        .setDescription('차단 사유를 입력하세요 (선택 사항).')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),

    new SlashCommandBuilder()
    .setName('ban')
    .setDescription('유저를 차단합니다.')
    .addUserOption(option =>
      option.setName('유저')
        .setDescription('차단할 유저를 선택하세요.')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('사유')
        .setDescription('차단 사유를 입력하세요 (선택 사항).')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),


    new SlashCommandBuilder()
    .setName('기간밴')
    .setDescription('유저를 지정된 시간 동안 임시 차단합니다.')
    .addUserOption(option =>
      option.setName('유저')
        .setDescription('임시 차단할 유저를 선택하세요.')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('시간')
        .setDescription('차단할 시간을 입력하세요.')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('단위')
        .setDescription('시간 단위를 선택하세요.')
        .addChoices(
          { name: '초', value: '초' },
          { name: '분', value: '분' },
          { name: '시간', value: '시간' },
          { name: '일', value: '일' },
        )
        .setRequired(true))
    .addStringOption(option =>
      option.setName('사유')
        .setDescription('차단 사유를 입력하세요 (선택 사항).')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),

    new SlashCommandBuilder()
    .setName('기능')
    .setDescription('봇의 켜거나 끕니다.')
    .addStringOption(option =>
      option.setName("기능")
      .setDescription("켜거나 끌 기능")
      .addChoices(
        { name: "tempban(기간밴)" , value: "tempban" },
        { name: "경고" , value: "warn" },
        // { name: "시발 기능 뭐넣지" , value: "tempban" },
        // { name: "tempban" , value: "tempban" },
      )
    ),

    new SlashCommandBuilder()
    .setName('dev')
    .setDescription('개발자전용명령어')
    .addSubcommand((option)=>
      option.setName("debugmode")
      .setDescription("enable/disable the debuging mode"))
    .addSubcommand(option=>
      option.setName("invite")
      .setDescription("gen invite link")
      .addStringOption(option2=>
        option2.setName("guild_id")
        .setDescription("enter the guild id")
        .setRequired(true)))
    .addSubcommand(option=>
      option.setName("delete")
      .setDescription("Delete server id DB")
      .addStringOption(option2=>
        option2.setName("guild_id")
        .setDescription("enter the guild id")
        .setRequired(true)))
    
    /** 
    .addSubcommand(option=>
      option.setName("debugmode")
      .setDescription("enable/disable the debuging mode")
      .addBooleanOption(option2=>
        option2.setName("enable?")
        .setDescription("true: enable, false: disable")
        .required(true)
      )
    )
    */
   ,
    new SlashCommandBuilder()
    .setName('타임아웃')
    .setDescription('유저를 지정된 시간 동안 타임아웃합니다.')
    .addUserOption(option =>
      option.setName('유저')
        .setDescription('타임아웃할 유저를 선택하세요.')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('시간')
        .setDescription('타임아웃 할 시간을 입력하세요.')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('단위')
        .setDescription('시간 단위를 선택하세요.')
        .addChoices(
          { name: '초', value: '초' },
          { name: '분', value: '분' },
          { name: '시간', value: '시간' },
          { name: '일', value: '일' },
        )
        .setRequired(true))
    .addStringOption(option =>
      option.setName('사유')
        .setDescription('타임아웃 사유를 입력하세요 (선택 사항).')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.MuteMembers),
  
  new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('유저를 지정된 시간 동안 타임아웃합니다.')
  .addUserOption(option =>
    option.setName('유저')
      .setDescription('타임아웃할 유저를 선택하세요.')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('시간')
      .setDescription('타임아웃 할 시간을 입력하세요.')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('단위')
      .setDescription('시간 단위를 선택하세요.')
      .addChoices(
        { name: '초', value: '초' },
        { name: '분', value: '분' },
        { name: '시간', value: '시간' },
        { name: '일', value: '일' },
      )
      .setRequired(true))
  .addStringOption(option =>
    option.setName('사유')
      .setDescription('타임아웃 사유를 입력하세요 (선택 사항).')
      .setRequired(false))
  .setDefaultMemberPermissions(PermissionsBitField.Flags.MuteMembers),

  new SlashCommandBuilder()
        .setName('캡차')
        .setDescription('네이버 캡차 인증을 시작합니다.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('인증')
                .setDescription('일반 캡차 인증을 시작합니다.')
        )
        ,
    new SlashCommandBuilder()
        .setName('캡차설정')
        .setDescription('캡차 인증 완료 시 역할을 부여하는 설정을 관리합니다. (관리자 전용)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild) // 서버 관리 권한 필요
        .addSubcommand(subcommand =>
            subcommand
                .setName('역할부여')
                .setDescription('캡차 인증 완료 시 부여할 역할을 설정합니다.')
                .addRoleOption(option =>
                    option.setName('역할')
                        .setDescription('캡차 통과 시 부여할 역할')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('설정해제')
                .setDescription('캡차 인증 완료 시 역할 부여 설정을 해제합니다.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('확인')
                .setDescription('현재 캡차 인증 완료 시 부여되는 역할을 확인합니다.')
        ),

        new SlashCommandBuilder()
        .setName('도움말')
        .setDescription('봇의 도움말을 확인합니다.'),

        new SlashCommandBuilder()
        .setName('help')
        .setDescription('봇의 도움말을 확인합니다.'),
      
];

let currentActivityIndex = 0; // 현재 활동 인덱스를 추적

// 클라이언트 준비 이벤트 핸들러
client.once(Events.ClientReady, async () => {
  console.log(`준비 완료! ${client.user.tag} 봇이 로그인했습니다.`);
      // 10초마다 봇 활동 변경
      setInterval(async () => {
        let membercount = await getTotalMemberCount(client);



        // 변경할 활동 목록 정의
        if  (!debugtogle){ 
const activities = await [
  { name: '악성유저와 경쟁', type: ActivityType.Competing },    // "~ 경쟁 중"
  { name: `${membercount} 명의 유저 보호`, type: ActivityType.Playing }, // "~ 플레이 중"
  { name: `서포트 서버에서 사용자의 의견`, type: ActivityType.Listening },      // "~ 듣는 중"
  { name: '서버 관리 화면', type: ActivityType.Watching },       // "~ 시청 중"
  { name: '문의 사항 응답 중 💬', type: ActivityType.Custom }, // "사용자 지정 상태"
  { name: '유튜브', type: ActivityType.Watching, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, // 스트리밍 (유효한 URL 필요)
];
        currentActivityIndex = await (currentActivityIndex + 1) % activities.length; // 다음 활동으로 이동 (리스트 끝에 다다르면 처음으로 돌아옴)
        const activity = await activities[currentActivityIndex];

        await client.user.setActivity(activity.name, {
            type: activity.type,
            url: activity.url || undefined // 스트리밍 아닐 땐 url 무시
        });

        // await console.log(`상태 변경: ${activity.name} (${Object.keys(ActivityType).find(key => ActivityType[key] === activity.type)})`);
      }
    }, 10 * 1000); // 10초 = 10000 밀리초

  await loadScheduledDeletions();
  try {
    // DB 기본 디렉토리 확인 및 생성
    ensureDirectoryExists('./DB');
    
    // 슬래시 커맨드 등록
    const rest = new REST({ version: '10' }).setToken(TOKEN);
        // 기존 글로벌 명령어 삭제
    
  await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: [] }, // 빈 배열을 전송하여 모든 명령어를 대체(즉, 삭제)합니다.
        );
    console.log('All global commands cleared!');
    
    console.log('슬래시 커맨드 등록 중...');``
    
    rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands.map(command => command.toJSON()) }
      // 슬래시 커맨드 등록 후 ID 확인
    );
    try {
      const commands = await rest.get(
        Routes.applicationCommands(CLIENT_ID)
      );
      
      // 등록된 모든 커맨드 ID와 이름 출력
      await commands.forEach(cmd => {
        console.log(`커맨드 이름: ${cmd.name}, ID: ${cmd.id}`);
      });
    } catch (error) {
      console.error('커맨드 목록 가져오기 실패:', error);
    }    
    console.log('슬래시 커맨드 등록 완료!');

    // 이미 참여한 모든 길드의 설정 로드
    client.guilds.cache.forEach(guild => {
      loadSettings(guild.id);
      log(guild.id, `길드 "${guild.name}" (${guild.id}) 설정 로드 완료`);
    });
  } catch (error) {
    console.error('초기화 중 오류 발생:', error);
  }
});
client.on(Events.GuildDelete, async guild => {
  // 봇이 길드에서 추방되었을 때
  const result = await scheduleGuildFolderDeletion(guild.id);
  if (typeof result === 'number') {
      console.log(`${guild.name} 길드 데이터 삭제 예약됨.`);
  } else {
      console.error(`길드 ${guild.name} 데이터 삭제 예약 실패: ${result}`);
  }
});
  // 길드 입장 이벤트 핸들러 (봇이 새 서버에 초대됐을 때)
client.on(Events.GuildCreate, async guild => {
  const developerId = "914868227652337695";
  const cancelled = await cancelGuildFolderDeletion(guild.id);
  if (cancelled) {
      console.log('이 길드의 데이터 삭제 예약이 취소되었습니다.');
  } else {
      console.error('이 길드에 대한 삭제 예약이 없습니다.');
  }
  try {
    loadSettings(guild.id);
    log(guild.id, `봇이 새 길드 "${guild.name}" (${guild.id})에 참여했습니다.`);
  } catch (error) {
    console.error(`길드 ${guild.id} 입장 처리 중 오류:`, error);
  }
  finally{
    const guildowner = await guild.fetchOwner();
    try{guildowner.send(`만나서 반가워요! <@${guildowner.id}>님! [여기](<https://github.com/kjh9211/SH-bot>)를 눌러 약관을 모두 꼼꼼히 읽어주세요! 이 문서를 읽지않고 생긴 모든 문제는 <@${guildowner.id}> 님께 책임이 있으니 꼭 확인해주세요!`);}catch(e){
      try{
      guild.systemChannel.send(`만나서 반가워요! <@${guildowner.id}>님! [여기](<https://github.com/kjh9211/SH-bot>)를 눌러 약관을 모두 꼼꼼히 읽어주세요! 이 문서를 읽지않고 생긴 모든 문제는 <@${guildowner.id}> 님께 책임이 있으니 꼭 확인해주세요!`)
    }catch(e){
      const developer = await client.users.fetch(developerId);
      developer.send(`<@${guildowner.id}> 가 ${guild.name} 에 봇을 추가했으나 서버에 시스템채널이 없고 서버주인의 DM 도 막혀있어, 전송이 불가능했습니다.`);
    }}

  }
});
let result;
  // 상호작용 생성 이벤트 핸들러 (슬래시 커맨드)
  client.on(Events.InteractionCreate, async interaction => {
    try {
      // 슬래시 커맨드 처리

      if (interaction.isCommand()) {
  
  const { commandName, options } = interaction;
  if (interaction.commandName === '캡차') {
    const subCommand = interaction.options.getSubcommand();

    if (subCommand === '인증') {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('generate_captcha')
                    .setLabel('캡차 생성')
                    .setStyle(ButtonStyle.Primary),
            );

        await interaction.reply({
            content: '캡차 인증을 시작하려면 아래 버튼을 눌러주세요.',
            components: [row]
        });
    }
} else if (interaction.commandName === '캡차설정') {
    // 관리자 권한 확인 (서버 관리 권한 필요)
    if (!interaction.memberPermissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({ content: '❌ 이 명령어는 **서버 관리자**만 사용할 수 있습니다.', ephemeral: true });
    }

    const subCommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    let currentSettings = await getGuildCaptchaSetting(guildId); // 현재 서버 설정 로드

    if (subCommand === '역할부여') {
        const role = interaction.options.getRole('역할');
        if (!role) {
            return interaction.reply({ content: '❌ 유효한 역할을 지정해야 합니다.', ephemeral: true });
        }

        currentSettings.verifiedRoleId = role.id; // 설정 업데이트
        await saveGuildCaptchaSetting(guildId, currentSettings); // 파일에 저장

        await interaction.reply({
            content: `✅ 캡차 인증 완료 시 **${role.name}** 역할이 부여되도록 설정되었습니다.`,
            ephemeral: true
        });
    } else if (subCommand === '설정해제') {
        delete currentSettings.verifiedRoleId; // 설정 제거
        await saveGuildCaptchaSetting(guildId, currentSettings); // 파일에 저장

        await interaction.reply({
            content: '✅ 캡차 인증 완료 시 역할 부여 설정이 해제되었습니다.',
            ephemeral: true
        });
    } else if (subCommand === '확인') {
        const currentRoleId = currentSettings.verifiedRoleId;
        if (currentRoleId) {
            const role = interaction.guild.roles.cache.get(currentRoleId);
            if (role) {
                await interaction.reply({
                    content: `현재 캡차 인증 완료 시 **${role.name}** 역할이 부여됩니다.`,
                    ephemeral: true
                });
            } else {
                // 역할이 삭제되었을 경우 설정도 제거
                delete currentSettings.verifiedRoleId;
                await saveGuildCaptchaSetting(guildId, currentSettings); // 파일에 저장
                await interaction.reply({
                    content: '⚠️ 현재 설정된 역할이 유효하지 않거나 삭제되었습니다. 설정이 해제됩니다.',
                    ephemeral: true
                });
            }
        } else {
            await interaction.reply({
                content: 'ℹ️ 현재 캡차 인증 완료 시 부여되는 역할이 설정되어 있지 않습니다.',
                ephemeral: true
            });
        }
    }
}
if (commandName === '도움말' || commandName === "help"){
  const embed = new EmbedBuilder()
  .setTitle("SH 봇 도움말")
  .setDescription(`만나서 반가워요! 저는 ${await getTotalMemberCount(client)} 명을 보호하고 있는 SH 봇이라고 해요!`)
  interaction.reply({embeds:[embed]})
}
  if (commandName === '기간밴' || commandName === "tempban") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({content:" 이 명령어를 사용할 권한이 없습니다!", flags: ['Ephemeral']})
    const user = interaction.options.getMember('유저');
    const time = interaction.options.getInteger('시간');
    const unit = interaction.options.getString('단위');
    const reason = interaction.options.getString('사유') || '사유 없음';

    if (!interaction.guild || !user) {
      return interaction.reply({ content: '서버 내에서 유저를 찾을 수 없습니다.', ephemeral: true });
    }

    const result = await tempbanMember(interaction.guild, user, time, unit, reason, interaction.user);
    await interaction.reply({ content: result });
  }
  if (commandName === 'timeout' || commandName === "타임아웃") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.MuteMembers)) return interaction.reply({content:" 이 명령어를 사용할 권한이 없습니다!", flags: ['Ephemeral']})
    const user = interaction.options.getMember('유저');
    const time = interaction.options.getInteger('시간');
    const unit = interaction.options.getString('단위');
    const reason = interaction.options.getString('사유') || '사유 없음';

    if (!interaction.guild || !user) {
      return interaction.reply({ content: '서버 내에서 유저를 찾을 수 없습니다.', ephemeral: true });
    }

    const timeoutdur = await timetosec(time, unit);
    try {
      await user.timeout(timeoutdur,`${interaction.user.tag} 님이 타임아웃: ${reason}, 해제시각(처벌시각 기준): ${time}${unit} 후`)
      result = `<@${user.id}> 를 성공적으로 타임아웃했습니다.`;
    } catch (error) {
      result = "타임아웃 중 오류가 발생했습니다. 봇의 권한와 역할의 위치를 확인해주세요.";
    }
    await interaction.reply({ content: result , flags:["Ephemeral"] });
  }
  if (commandName === 'ban' || commandName === "밴") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({content:" 이 명령어를 사용할 권한이 없습니다!", flags: ['Ephemeral']})
    const user = interaction.options.getMember('유저');
    const reason = interaction.options.getString('사유') || '사유 없음';

    if (!interaction.guild || !user) {
      return interaction.reply({ content: '서버 내에서 유저를 찾을 수 없습니다.', ephemeral: true });
    }

    const result = await user.bannable ? user.ban({reason:reason}) : "봇의 권한이 낮습니다!"
    await interaction.reply({ content: result });
  }
  if (commandName === '경고') {
    const subcommand = options.getSubcommand();
    if (!interaction.memberPermissions.has(PermissionFlagsBits.KickMembers)) return interaction.reply({content:" 이 명령어를 사용할 권한이 없습니다!", flags: ['Ephemeral']})
    
    try {
      if (subcommand === '지급') {
        const user = options.getUser('유저');
        const count = options.getInteger('개수');
        const reason = options.getString('사유');
        const warningMessage = options.getString('경고메세지');
        
        await handleWarnAdd(interaction, user, count, reason, warningMessage);
      } else if (subcommand === '차감') {
        const user = options.getUser('유저');
        const count = options.getInteger('개수');
        const reason = options.getString('사유');
        
        await handleWarnRemove(interaction, user, count, reason);
      } else if (subcommand === '확인') {
        const user = options.getUser('유저');
        
        await handleWarnCheck(interaction, user);
      }
    } catch (error) {
      console.error(`Error handling command: ${error}`);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: '명령어 처리 중 오류가 발생했습니다.', 
          ephemeral: true 
        });
      } else {
        await interaction.followUp({ 
          content: '명령어 처리 중 오류가 발생했습니다.', 
          ephemeral: true 
        });
      }
    }
  }
        if (commandName === '핑') {
          const sent = await interaction.reply({ content: '핑 측정 중...', fetchReply: true });
          const latency = sent.createdTimestamp - interaction.createdTimestamp;
          const guildId = interaction.guild?.id || 'unknown';
          
          await interaction.editReply(`Pong! 지연 시간: ${client.ws.ping}ms (체감핑:${latency}ms)`);
          log(guildId, `${interaction.user.tag}님이 핑 명령어 사용. 지연 시간: ${latency}ms`);
        }
        if (commandName === 'dev') {
          const subcommand = await options.getSubcommand();
          const guildId = interaction.guild.id;
          if (interaction.member.id != 914868227652337695) return interaction.reply({content:" 이 명령어를 사용할 권한이 없습니다!", flags: ['Ephemeral']});
          switch (subcommand){
            case "debugmode":{
              
              debugtogle = debugtogle?false:true;
              interaction.reply({ content: `Debugmode is ${debugtogle?"enabled":"disabled"}!`, flags: ['Ephemeral'] });
              await client.user.setActivity("디버깅", {
                type: ActivityType.Playing
            });
              return;
            }
            case 'invite':{
              const guildId = interaction.options.getString('guild_id');
      
              try {
                  const guild = await client.guilds.fetch(guildId);
      
                  if (!guild) {
                      return interaction.reply({ content: '해당 ID를 가진 길드를 찾을 수 없습니다.', ephemeral: true });
                  }
      
                  // 길드의 "일반" 채널을 찾거나, 없으면 첫 번째 텍스트 채널을 찾습니다.
                  const channel = guild.channels.cache.find(
                      ch => ch.name === '일반' && ch.isTextBased()
                  ) || guild.channels.cache.find(ch => ch.isTextBased());
      
                  if (!channel) {
                      return interaction.reply({ content: '초대 링크를 생성할 수 있는 텍스트 채널을 찾을 수 없습니다.', ephemeral: true });
                  }
      
                  // 봇이 채널에서 초대 링크를 생성할 권한이 있는지 확인
                  if (!guild.members.me.permissionsIn(channel).has(PermissionsBitField.Flags.CreateInstantInvite)) {
                      return interaction.reply({ content: '봇이 해당 채널에서 초대 링크를 생성할 권한이 없습니다.', ephemeral: true });
                  }
      
                  const invite = await channel.createInvite({
                      maxAge: 0, // 0 = 무제한
                      maxUses: 0 // 0 = 무제한
                  });
                  try {
                    await client.guilds.cache.get(guildId).addMember(req.user.id, { accessToken: req.user.accessToken })
                  } catch (error) {
                    
                  }
      
                  interaction.reply({ content: `**${guild.name}** 길드의 초대 링크: ${invite.url}`,ephemeral: true });
      
              } catch (error) {
                  console.error('초대 링크 생성 중 오류 발생:', error);
                  interaction.reply({ content: '초대 링크를 생성하는 도중 오류가 발생했습니다. 길드 ID를 확인하거나 봇의 권한을 확인해주세요.', ephemeral: true });
              }
              finally{
                return;

              }
          }
          case 'delete':{
              const guildId = interaction.options.getString('guild_id');
      
                await scheduleGuildFolderDeletion(guildId,60*1000);

              interaction.reply({ content: 'DB 에서 길드 데이터를 1분 뒤에 삭제합니다.', ephemeral: true });
            
          }
          }
          log(guildId, `${interaction.user.tag}님이 dev 명령어 사용.`);
        }
      }
        // 버튼 상호작용 처리 (이전 코드와 거의 동일)
    if (interaction.isButton()) {
      if (interaction.customId === 'generate_captcha') {
          await interaction.deferReply({ ephemeral: true });

          const userId = interaction.user.id;
          const api_url = `https://openapi.naver.com/v1/captcha/nkey?code=0`;

        const nclient= await getnclient()

          const options = {
              url: api_url,
              headers: {
                  'X-Naver-Client-Id': nclient.id,
                  'X-Naver-Client-Secret': nclient.pw
              }
          };

          request.get(options, async (error, response, body) => {
              if (!error && response.statusCode === 200) {
                  const jsonBody = JSON.parse(body);
                  const captchaKey = jsonBody.key;

                  const image_api_url = `https://openapi.naver.com/v1/captcha/ncaptcha.bin?key=${captchaKey}`;
                  const image_options = {
                      url: image_api_url,
                      headers: {
                          'X-Naver-Client-Id': NAVER_CLIENT_ID,
                          'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
                      },
                      encoding: null
                  };

                  request.get(image_options, async (imgError, imgResponse, imgBody) => {
                      if (!imgError && imgResponse.statusCode === 200) {
                          const attachment = new AttachmentBuilder(imgBody, { name: 'captcha.jpg' });

                          const row = new ActionRowBuilder()
                              .addComponents(
                                  new ButtonBuilder()
                                      .setCustomId('submit_captcha')
                                      .setLabel('캡차 입력')
                                      .setStyle(ButtonStyle.Primary),
                                  new ButtonBuilder()
                                      .setCustomId('regenerate_captcha')
                                      .setLabel('새로고침')
                                      .setStyle(ButtonStyle.Secondary),
                              );

                          const sentMessage = await interaction.editReply({
                              content: '다음 캡차 이미지를 보고 텍스트를 정확히 입력해주세요.',
                              files: [attachment],
                              components: [row],
                              ephemeral: true
                          });

                          activeCaptchas.set(userId, { key: captchaKey, messageId: sentMessage.id });

                      } else {
                          console.error(`캡차 이미지 요청 오류: ${imgResponse ? imgResponse.statusCode : imgError}`);
                          await interaction.editReply({ content: '❌ 캡차 이미지를 불러오는 데 실패했습니다. 다시 시도해주세요.', ephemeral: true });
                      }
                  });
              } else {
                  console.error(`캡차 키 발급 오류: ${response ? response.statusCode : error}`);
                  await interaction.editReply({ content: '❌ 캡차 키 발급에 실패했습니다. 다시 시도해주세요.', ephemeral: true });
              }
          });
      } else if (interaction.customId === 'submit_captcha') {
          const userId = interaction.user.id;
          const userCaptchaSession = activeCaptchas.get(userId);

          if (!userCaptchaSession) {
              return await interaction.reply({ content: '❌ 진행 중인 캡차 세션이 없습니다. `/캡차 인증` 명령어로 다시 시작해주세요.', ephemeral: true });
          }

          await interaction.showModal({
              customId: 'captcha_input_modal',
              title: '캡차 입력',
              components: [
                  new ActionRowBuilder().addComponents(
                      new TextInputBuilder()
                          .setCustomId('captcha_value_input')
                          .setLabel('이미지에서 보이는 텍스트를 입력하세요.')
                          .setStyle(TextInputStyle.Short)
                          .setRequired(true)
                          .setMinLength(1)
                          .setMaxLength(10)
                  ),
              ],
          });

      } else if (interaction.customId === 'regenerate_captcha') {
          const userId = interaction.user.id;
          const userCaptchaSession = activeCaptchas.get(userId);

          if (!userCaptchaSession) {
              return await interaction.reply({ content: '❌ 진행 중인 캡차 세션이 없습니다. `/캡차 인증` 명령어로 다시 시작해주세요.', ephemeral: true });
          }

          await interaction.deferUpdate();

          const api_url = `https://openapi.naver.com/v1/captcha/nkey?code=0`;

          const options = {
              url: api_url,
              headers: {
                  'X-Naver-Client-Id': NAVER_CLIENT_ID,
                  'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
              }
          };

          request.get(options, async (error, response, body) => {
              if (!error && response.statusCode === 200) {
                  const jsonBody = JSON.parse(body);
                  const newCaptchaKey = jsonBody.key;

                  const image_api_url = `https://openapi.naver.com/v1/captcha/ncaptcha.bin?key=${newCaptchaKey}`;
                  const image_options = {
                      url: image_api_url,
                      headers: {
                          'X-Naver-Client-Id': NAVER_CLIENT_ID,
                          'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
                      },
                      encoding: null
                  };

                  request.get(image_options, async (imgError, imgResponse, imgBody) => {
                      if (!imgError && imgResponse.statusCode === 200) {
                          const attachment = new AttachmentBuilder(imgBody, { name: 'captcha.jpg' });

                          const row = new ActionRowBuilder()
                              .addComponents(
                                  new ButtonBuilder()
                                      .setCustomId('submit_captcha')
                                      .setLabel('캡차 입력')
                                      .setStyle(ButtonStyle.Primary),
                                  new ButtonBuilder()
                                      .setCustomId('regenerate_captcha')
                                      .setLabel('새로고침')
                                      .setStyle(ButtonStyle.Secondary),
                              );

                          await interaction.editReply({
                              content: '새로운 캡차 이미지입니다. 텍스트를 입력해주세요.',
                              files: [attachment],
                              components: [row],
                          });

                          activeCaptchas.set(userId, { key: newCaptchaKey, messageId: interaction.message.id });

                      } else {
                          console.error(`새 캡차 이미지 요청 오류: ${imgResponse ? imgResponse.statusCode : imgError}`);
                          await interaction.editReply({ content: '❌ 새 캡차 이미지를 불러오는 데 실패했습니다. 다시 시도해주세요.', ephemeral: true });
                      }
                  });
              } else {
                  console.error(`새 캡차 키 발급 오류: ${response ? response.statusCode : error}`);
                  await interaction.editReply({ content: '❌ 새 캡차 키 발급에 실패했습니다. 다시 시도해주세요.', ephemeral: true });
              }
          });
      }
  }

  // 모달 상호작용 처리
  if (interaction.isModalSubmit()) {
      if (interaction.customId === 'captcha_input_modal') {
          await interaction.deferReply({ ephemeral: true });

          const userId = interaction.user.id;
          const userCaptchaSession = activeCaptchas.get(userId);

          if (!userCaptchaSession) {
              return await interaction.reply({ content: '❌ 진행 중인 캡차 세션이 없습니다. `/캡차 인증` 명령어로 다시 시작해주세요.', ephemeral: true });
          }

          const captchaKey = userCaptchaSession.key;
          const userInputValue = interaction.fields.getTextInputValue('captcha_value_input');

          const api_url = `https://openapi.naver.com/v1/captcha/nkey?code=1&key=${captchaKey}&value=${encodeURIComponent(userInputValue)}`;

          const options = {
              url: api_url,
              headers: {
                  'X-Naver-Client-Id': NAVER_CLIENT_ID,
                  'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
              }
          };

          request.get(options, async (error, response, body) => {
              if (!error && response.statusCode === 200) {
                  const jsonBody = JSON.parse(body);
                  if (jsonBody.result) {
                      await interaction.editReply({ content: '✅ 캡차가 성공적으로 확인되었습니다!', ephemeral: true });
                      
                      // 인증 완료 시 역할 부여 로직
                      const guildId = interaction.guildId;
                      const currentSettings = await getGuildCaptchaSetting(guildId); // 최신 설정 로드
                      const roleToAssignId = currentSettings.verifiedRoleId;

                      if (roleToAssignId) { // 설정된 역할 ID가 있다면
                          try {
                              const member = interaction.member;
                              const role = interaction.guild.roles.cache.get(roleToAssignId);

                              if (member && role) {
                                  const botMember = interaction.guild.members.me;
                                  if (botMember.permissions.has(PermissionsBitField.Flags.ManageRoles) && botMember.roles.highest.position > role.position) {
                                      await member.roles.add(role);
                                      await interaction.followUp({ content: `✅ **${role.name}** 역할을 부여했습니다!`, ephemeral: true });
                                  } else {
                                      let errorMessage = '봇이 역할을 부여할 권한이 없거나, 봇의 역할 순위가 낮습니다.';
                                      await interaction.followUp({ content: '⚠️ ' + errorMessage + ' 관리자에게 문의해주세요. 오류코드: Missing permission', ephemeral: true });
                                      console.warn(`역할 부여 실패: ${errorMessage} (사용자: ${userId}, 서버: ${guildId}, 역할 ID: ${roleToAssignId})`);
                                  }
                              } else {
                                  await interaction.followUp({ content: '⚠️ 역할 부여에 필요한 멤버 또는 역할을 찾을 수 없습니다. 관리자에게 문의해주세요.', ephemeral: true });
                              }
                          } catch (roleError) {
                              console.error('역할 부여 중 오류 발생:', roleError);
                              await interaction.followUp({ content: '❌ 역할 부여 중 오류가 발생했습니다. 관리자에게 문의해주세요.', ephemeral: true });
                          }
                      }

                      activeCaptchas.delete(userId); // 성공 시 캡차 세션 제거
                  } else {
                      await interaction.editReply({ content: '❌ 캡차가 일치하지 않습니다. 다시 시도해주세요.', ephemeral: true });
                  }
              } else {
                  console.error(`캡차 결과 검증 오류: ${response ? response.statusCode : error}`);
                  await interaction.editReply({ content: '❌ 캡차 결과 검증에 실패했습니다. 다시 시도해주세요.', ephemeral: true });
              }
          });
      }
  }
    } catch (error) {
      console.error('명령어 처리 중 오류 발생:', error);
      
      // 길드 ID 가져오기 (상호작용에서 가능한 경우)
      const guildId = interaction.guild?.id || 'unknown';
      log(guildId, `명령어 처리 중 오류 발생: ${error.message}`);
      
      // 이미 응답된 상호작용이 아니라면 오류 메시지 전송
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '명령어 처리 중 오류가 발생했습니다. 나중에 다시 시도해주세요.' }).catch(console.error);
      } else {
        await interaction.reply({ content: '명령어 처리 중 오류가 발생했습니다. 나중에 다시 시도해주세요.', ephemeral: true }).catch(console.error);
      }
    }
  });
  
// Handle prefix commands
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    // const developer = await client.users.fetch("914868227652337695");
    const developerId = "914868227652337695"; 
    
    let developer;
    try {
        // 개발자 유저 객체를 가져옵니다. 봇이 시작될 때 한 번만 가져오는 것을 고려해볼 수 있습니다.
        developer = await client.users.fetch(developerId);
    } catch (error) {
        console.error(`[오류] 개발자(${developerId}) 유저 정보를 가져오는데 실패했습니다:`, error);
        // 개발자 정보를 가져오지 못하면 더 이상 진행할 수 없으므로 여기서 함수 종료
        return; 
    }

    // 메시지가 DM 채널에서 온 경우 (!message.guild는 DM 채널을 의미)
    if (!message.guild) {
        // 1. 개발자가 DM 채널에서 봇에게 답장한 경우 (A에게 전달할 메시지)
        // D가 봇이 전달한 A의 메시지에 답장하는 경우
        if (message.author.id === developerId && message.reference) {
            try {
                // 개발자가 답장한 원본 메시지(봇이 A의 메시지를 D에게 전달했던 메시지)를 가져옴
                const referencedMessage = await message.fetchReference();
                
                // referencedMessage가 봇이 전달한 A의 메시지인지 확인 필요
                // 해당 메시지가 봇이 보낸 메시지이고, 특정 형식을 가진다면 (예: '<@유저ID>(유저태그) 님의 메시지:' 로 시작)
                // 여기서 원본 유저의 ID를 추출하여 해당 유저에게 답장합니다.

                // 간단한 예시: 원본 메시지가 특정 형식을 따르거나,
                // 아니면 봇이 A의 메시지를 D에게 전달할 때 어떤 메타데이터를 저장하는 방법이 필요.
                // 여기서는 'beforemessage'가 A의 메시지라고 가정.
                // 실제 구현에서는 referencedMessage.content에서 A의 ID를 파싱하거나,
                // 봇이 DM 기록을 저장하는 더 복잡한 로직이 필요할 수 있습니다.
                // 여기서는 A가 봇에게 보낸 '첫' DM의 author가 A라는 것을 활용합니다.
                
                // 이 예시에서는 개발자가 답장한 'referencedMessage'의 원본이 A에게서 온 메시지라고 가정
                // 실제 A에게 전달해야 할 메시지의 `author`를 찾아내야 합니다.

                // 'referencedMessage'가 봇이 'A'에게서 받은 DM을 'D'에게 전달했던 그 메시지라고 가정
                // 즉, referencedMessage.content에 A의 ID가 포함되어 있다고 가정.
                const originalUserIdMatch = referencedMessage.content.match(/^<@(\d+)>\((.+?)\) 님의 메시지:/);

                if (originalUserIdMatch && originalUserIdMatch[1]) {
                    const originalUserId = originalUserIdMatch[1];
                    const originalUser = await client.users.fetch(originalUserId);

                    await originalUser.send(`개발자의 답변: ${message.content}`);
                    console.log(`[DM전달] 개발자(${developer.tag}) -> 유저(${originalUser.tag})`);
                } else {
                    console.warn(`[경고] 개발자의 답장 메시지가 특정 형식의 원본 메시지를 참조하지 않습니다: ${message.content}`);
                    await developer.send("🚫 오류: 참조된 메시지에서 원본 유저 정보를 찾을 수 없습니다. DM 시스템이 오작동할 수 있습니다.");
                }

            } catch (error) {
                if (error.code === 50007) {
                    console.error(`[API오류] 개발자(${developer.tag})의 답변을 원본 유저에게 보낼 수 없습니다. (차단 또는 공유 서버 없음)`);
                } else {
                    console.error("[오류] 개발자의 답변 전달 중 오류 발생:", error);
                }
            }
        } 
        // 2. 일반 유저(A)가 봇에게 DM을 보낸 경우 (첫 DM이거나, D의 답장에 대한 재답장)
        else {
            try {
                // D에게 A의 메시지를 전달
                await developer.send(`<@${message.author.id}>(${message.author.tag}) 님의 메시지: ${message.content}\n이 문의에 응답하려면 이 메시지에 **답장**하세요.`);
                console.log(`[DM전달] 유저(${message.author.tag}) -> 개발자(${developer.tag})`);
            } catch (error) {
                if (error.code === 50007) {
                    console.error(`[API오류] 유저(${message.author.tag})의 DM을 개발자에게 보낼 수 없습니다. (개발자 차단 또는 공유 서버 없음)`);
                    // 유저에게 DM 전달 실패를 알리는 것을 고려
                    try {
                        await message.author.send("죄송합니다. 현재 개발자에게 메시지를 전달할 수 없습니다. 잠시 후 다시 시도해 주십시오.");
                    } catch (e) {
                        console.error("[오류] 유저에게 오류 메시지 전송 실패:", e);
                    }
                } else {
                    console.error("[오류] 유저의 DM을 개발자에게 전달 중 오류 발생:", error);
                }
            }
        }
    }
    /**
    if (!message.guild){
      if (message.reference&&message.author.id==914868227652337695){
        const beforemessage = await message.fetchReference();
        beforemessage.author.send(`개발자의 답변: ${message.content}`);
      }
      else if(message.reference){
        developer.send(`<@${message.author.id}>(${message.author.tag}) 님의 메시지: ${message.content.toString()}\n이 문의에 응답할려면 답장을 하세요.`)
      }
      else{
        developer.send(`<@${message.author.id}>(${message.author.tag}) 님의 메시지: ${message.content.toString()}\n이 문의에 응답할려면 답장을 하세요.`)

      }
  }
  */
  if (is_bad.test(message)){
    message.react("⚠️")
  }

  if (!message.content.startsWith(prefix)) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    if (message.content.startsWith("!강제탈퇴")&&message.author.id == developerId){
      const cancelled = await scheduleGuildFolderDeletion(message.guild.id,10000);
      console.log(cancelled);

          message.reply('이 서버의 데이터 삭제 예약이 완료되었습니다. 이 서버의 모든데이터가 10초 뒤에 삭제됩니다.');
    }
    if (message.content === '!탈퇴' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      const cancelled = await scheduleGuildFolderDeletion(message.guild.id);
      console.log(cancelled);

          message.reply('이 서버의 데이터 삭제 예약이 완료되었습니다. 이 서버의 모든데이터가 1일 뒤에 삭제됩니다.');
  }
  if (message.content === '!탈퇴취소' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const cancelled = await cancelGuildFolderDeletion(message.guild.id);
    if (cancelled) {
        message.reply('이 서버의 데이터 삭제 예약 취소가 완료되었습니다.');
    } else {
        message.reply("이 서버의 예약된 삭제예약이 없습니다.");
    }
}
if (message.content.startsWith("!서포트서버")) return message.reply("https://discord.gg/z3HpT4ZhGF");
if (message.content.startsWith(`<@${client.user.id}>`)){
  const embed = new EmbedBuilder()
  .setTitle("SH 봇 설명!")
  .setDescription(`안녕하세요!
`)
  message.reply({embeds: []});
}
    if (message.content.startsWith('!tempban')||message.content.startsWith('!기간밴')) {
      // 명령어 형식: !tempban <유저멘션> <시간> <단위> [사유]
      // 예시: !tempban @사용자 5 분 귀찮게 해서
      const args = message.content.split(' ');
      if (args.length < 4) {
        return message.reply('명령어 사용법: `!tempban <유저멘션> <시간> <단위> [사유]`');
      }
  
      const user = message.mentions.members.first();
      const time = parseInt(args[2]);
      const unit = args[3].toLowerCase();
      const reasonArgs = args.slice(4);
      const reason = reasonArgs.length > 0 ? reasonArgs.join(' ') : '사유 없음';
  
      if (!user) {
        return message.reply('차단할 유저를 멘션해주세요.');
      }
  
      if (isNaN(time) || time <= 0) {
        return message.reply('차단 시간은 유효한 숫자여야 합니다.');
      }
  
      const result = await tempbanMember(message.guild, user, time, unit, reason, message.author);
      message.reply(result);
    }
    if (command === '경고') {
      const subcommand = args[0]?.toLowerCase();
      if(!message.member.permissions.has(PermissionFlagsBits.Administrator)) return

      
      try {
        // Extract common parameters
        const user = message.mentions.users.first();
        
        if (!user) {
          return message.reply('유저를 멘션해주세요.');
        }
        
        if (subcommand === '지급') {
          // Format: !경고 지급 @user 개수 사유 {경고메세지}
          const count = parseInt(args[2]) || 1;
          
          // Extract reason and warning message
          let fullText = args.slice(3).join(' ');
          let reason = fullText;
          let warningMessage = null;
          
          // Check if there's a warning message in curly braces
          const msgMatch = fullText.match(/{([^}]*)}/);
          if (msgMatch) {
            // Remove the warning message from the reason
            reason = fullText.replace(msgMatch[0], '').trim() || '사유 없음';
            warningMessage = msgMatch[1];
          }
          
          // Create a custom interaction-like object for the handler
          const customInteraction = {
            guild: message.guild,
            user: message.author,
            channel: message.channel,
            reply: null
          };
          
          await handleWarnAdd(message, user, count, reason, warningMessage);
        } else if (subcommand === '차감') {
          // Format: !경고 차감 @user 개수 사유
          const count = parseInt(args[2]) || 1;
          const reason = args.slice(3).join(' ') || '사유 없음';
          
          await handleWarnRemove(message, user, count, reason);
        } else if (subcommand === '확인') {
          // Format: !경고 확인 @user
          await handleWarnCheck(message, user);
        } else {
          message.reply('올바른 명령어: `!경고 지급/차감/확인 @유저 [개수] [사유] {경고메세지}`');
        }
      } catch (error) {
        console.error(`Error handling prefix command: ${error}`);
        message.reply('명령어 처리 중 오류가 발생했습니다.');
      }
    }
  });

  client.on(Events.GuildMemberAdd, async member => {
    // 새로 들어온 멤버가 봇인지 확인
    if (member.user.bot) {
        // 봇의 public_flags에서 VERIFIED_BOT 플래그를 확인
        // 미인증 봇인지 그리고 화이트리스트에 없는 봇인지 확인
        if (!member.user.flags.has(UserFlags.VerifiedBot) && !botallowlist.includes(member.user.id.toString())) {
            try {
                // 봇에게 부여된 기본 봇 역할을 찾습니다.
                // 봇은 서버에 추가될 때 자신의 ID와 동일한 이름을 가진 역할이 자동으로 생성되고 부여됩니다.
                // 그러나 이 역할은 member.roles 캐시에서 직접 가져오기 어려울 수 있습니다.
                // 가장 확실한 방법은 member.roles.cache에서 봇 ID와 일치하는 이름의 역할을 찾거나
                // (더 나은 방법) 봇이 가진 역할 중 Administrator 권한을 가진 역할을 찾는 것입니다.
                
                // 여기서는 봇이 가진 역할 중 Administrator 권한을 가진 역할을 찾아서 권한을 제거하는 방식으로 접근합니다.
                // 봇이 서버에 들어올 때 부여받는 봇 역할은 기본적으로 관리자 권한을 가지지 않습니다.
                // 만약 봇 추가 시 서버 관리자가 실수로 관리자 권한을 부여한 경우에만 해당됩니다.
                const botRolesWithAdmin = member.roles.cache.filter(role =>
                    role.permissions.has(PermissionsBitField.Flags.Administrator)
                );

                for (const role of botRolesWithAdmin.values()) {
                    // @everyone 역할은 건드리지 않도록 주의
                    if (role.id === member.guild.id) continue; // @everyone 역할 ID는 길드 ID와 같습니다.

                    console.log(`[${member.guild.name}] 미인증/화이트리스트에 없는 봇 "${member.user.tag}"의 역할 "${role.name}"에서 관리자 권한을 제거합니다.`);
                    
                    // 권한을 제거한 새 권한 비트 필드를 만듭니다.
                    const newPermissions = new PermissionsBitField(role.permissions).remove(PermissionsBitField.Flags.Administrator);
                    
                    // 역할의 권한을 업데이트합니다.
                    await role.setPermissions(newPermissions);
                    console.log(`[${member.guild.name}] "${member.user.tag}"의 역할 "${role.name}"에서 관리자 권한이 성공적으로 제거되었습니다.`);
                    const guildowner = await client.users.fetch(member.guild.ownerId);
                    guildowner.send(`경고! 인증되지 않은 봇 "${member.user.tag}"이 서버 "${member.guild.name}"에 입장했습니다!\n이 봇이 관리자 권한을 가지고 있어 제거했습니다!`)
    
                  }
            } catch (error) {
                console.error(`[${member.guild.name}] 봇 "${member.user.tag}"의 역할 권한을 변경하는 중 오류 발생:`, error);
                // 오류 발생 시 관리자에게 알림을 보내는 등의 추가 로직을 구현할 수 있습니다.
                const guildowner = await client.users.fetch(member.guild.ownerId);
                guildowner.send(`경고! 인증되지 않은 봇 "${member.user.tag}"이 서버 "${member.guild.name}"에 입장했습니다!\n이 봇이 관리자 권한을 가지고 있어 제거를 시도했으나 실패했습니다! \n오류 코드: \`[${error.code}]${error.message}\``)
            }
        }
    }
});

  // 에러 핸들링
  client.on(Events.Error, error => {
    console.error('클라이언트 오류 발생:', error);
    // 글로벌 로그 (특정 길드에 연결되지 않은 오류)
    try {
      const globalLogDir = path.join('./DB', 'global');
      ensureDirectoryExists(globalLogDir);
      
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] 클라이언트 오류: ${error.message}\n`;
      
      fs.appendFile(path.join(globalLogDir, 'log.log'), logMessage, err => {
        if (err) console.error('글로벌 로그 파일 쓰기 오류:', err);
      });
    } catch (logError) {
      console.error('로그 파일 쓰기 중 오류:', logError);
    }
  });
  
  process.on('unhandledRejection', error => {
    console.error('처리되지 않은 Promise rejection:', error);
    
    // 글로벌 로그
    try {
      const globalLogDir = path.join('./DB', 'global');
      ensureDirectoryExists(globalLogDir);
      
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] 처리되지 않은 Promise rejection: ${error.message}\n`;
      
      fs.appendFile(path.join(globalLogDir, 'log.log'), logMessage, err => {
        if (err) console.error('글로벌 로그 파일 쓰기 오류:', err);
      });
    } catch (logError) {
      console.error('로그 파일 쓰기 중 오류:', logError);
    }
  });
  
  // 봇 로그인
  client.login(TOKEN).catch(error => {
    console.error('로그인 실패:', error);
    
    // 글로벌 로그
    try {
      const globalLogDir = path.join('./DB', 'global');
      ensureDirectoryExists(globalLogDir);
      
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] 로그인 실패: ${error.message}\n`;
      
      fs.appendFile(path.join(globalLogDir, 'log.log'), logMessage, err => {
        if (err) console.error('글로벌 로그 파일 쓰기 오류:', err);
      });
    } catch (logError) {
      console.error('로그 파일 쓰기 중 오류:', logError);
    }
    
    process.exit(1);
  });

