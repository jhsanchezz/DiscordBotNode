import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import fs from "fs";
import dotenv from "dotenv";
import express from "express";
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const dataFile = "./data.json";
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify({ devices: {} }, null, 2));

function loadData() {
  return JSON.parse(fs.readFileSync(dataFile));
}
function saveData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// --- Detecta mensajes del webhook ---
client.on("messageCreate", (msg) => {
  if (msg.channel.id !== process.env.CHANNEL_ID) return;
  if (!msg.content.includes("Device:")) return;

  const deviceMatch = msg.content.match(/Device:\s*(\S+)/);
  if (!deviceMatch) return;

  const device = deviceMatch[1];
  const data = loadData();
  
  // Inicializar dispositivo si no existe
  if (!data.devices[device]) {
    data.devices[device] = {
      pausas: [],
      warnings: [],
      errores: [],
      ultimoReporte: null,
      planDiario: null,
      estadoBotones: null,
      estimadoCanciones: null,
      statusUpdates: [],
      critico: false,
      motivoCritico: null
    };
  }

  const deviceData = data.devices[device];
  deviceData.ultimoReporte = new Date().toISOString();

  // Detectar Plan diario generado
  if (msg.content.includes("Plan diario generado")) {
    const pausas = [...msg.content.matchAll(/Pausa #(\d+):\s*(.*?)\s*\((\d+)\s*min\)/g)].map(m => ({
      numero: parseInt(m[1]),
      hora: m[2],
      duracion: parseInt(m[3])
    }));
    
    const totalPausasMatch = msg.content.match(/Total de pausas:\s*(\d+)/);
    const inicioMatch = msg.content.match(/Inicio:\s*(.+?)(?=\n|Dispositivo:)/);
    const cancionesMatch = msg.content.match(/Estimado canciones.*?:\s*(\d+)/);
    
    deviceData.pausas = pausas;
    deviceData.planDiario = {
      inicio: inicioMatch ? inicioMatch[1].trim() : null,
      totalPausas: totalPausasMatch ? parseInt(totalPausasMatch[1]) : pausas.length,
      generadoEn: new Date().toISOString()
    };
    deviceData.estimadoCanciones = cancionesMatch ? parseInt(cancionesMatch[1]) : null;
    
    console.log(`📅 Plan diario del device ${device}: ${pausas.length} pausas`);
  }
  
  // Detectar Warnings
  else if (msg.content.match(/Warning\s+\w+/)) {
    const warningType = msg.content.match(/Warning\s+(\w+)/)[1];
    const descripcion = msg.content.split('\n')[2] || "Sin descripción";
    const repeticionMatch = msg.content.match(/Repeticion:\s*(\d+)\s*\/\s*(\d+)/);
    
    const warning = {
      tipo: warningType,
      descripcion: descripcion.trim(),
      repeticion: repeticionMatch ? `${repeticionMatch[1]}/${repeticionMatch[2]}` : null,
      timestamp: new Date().toISOString()
    };
    
    deviceData.warnings.push(warning);
    if (deviceData.warnings.length > 50) deviceData.warnings.shift(); // Mantener últimos 50
    
    console.log(`⚠️ Warning en ${device}: ${warningType}`);
  }
  
  // Detectar Errores
  else if (msg.content.match(/Error\s+\w+/)) {
    const errorType = msg.content.match(/Error\s+(\w+)/)[1];
    const javaExceptionMatch = msg.content.match(/JavaException:\s*(.+)/);
    const repeticionMatch = msg.content.match(/Repeticion:\s*(\d+)\s*\/\s*(\d+)/);
    
    const error = {
      tipo: errorType,
      excepcion: javaExceptionMatch ? javaExceptionMatch[1].trim() : null,
      repeticion: repeticionMatch ? `${repeticionMatch[1]}/${repeticionMatch[2]}` : null,
      timestamp: new Date().toISOString()
    };
    
    deviceData.errores.push(error);
    if (deviceData.errores.length > 50) deviceData.errores.shift(); // Mantener últimos 50
    
    console.log(`❌ Error en ${device}: ${errorType}`);
  }
  
  // Detectar Status update (cada 30 min del script)
  else if (msg.content.includes("Status update")) {
    const hoursMatch = msg.content.match(/Elapsed hours:\s*([\d.]+)/);
    const songsMatch = msg.content.match(/Songs played:\s*(\d+)/);
    const pausesMatch = msg.content.match(/Pauses done:\s*(\d+)/);
    
    const statusUpdate = {
      horasTranscurridas: hoursMatch ? parseFloat(hoursMatch[1]) : null,
      cancionesReproducidas: songsMatch ? parseInt(songsMatch[1]) : null,
      pausasHechas: pausesMatch ? parseInt(pausesMatch[1]) : null,
      timestamp: new Date().toISOString()
    };
    
    deviceData.statusUpdates.push(statusUpdate);
    if (deviceData.statusUpdates.length > 20) deviceData.statusUpdates.shift(); // Mantener últimos 20
    deviceData.critico = false; // Si reporta status, ya no está crítico
    
    console.log(`📊 Status update de ${device}: ${statusUpdate.cancionesReproducidas} canciones, ${statusUpdate.pausasHechas} pausas`);
  }
  
  // Detectar mensajes CRÍTICOS (Next button not found, script stopping)
  else if (msg.content.includes("CRITICAL") || msg.content.includes("Stopping QA bot")) {
    deviceData.critico = true;
    deviceData.motivoCritico = msg.content.includes("Next") ? "Next button not found" : "Script stopped";
    
    console.log(`🚨 CRÍTICO: ${device} - ${deviceData.motivoCritico}`);
  }
  
  // Detectar inicio del script - detección de botones
  else if (msg.content.includes("Inicio del script - deteccion de botones") || 
           msg.content.includes("Resultados deteccion botones")) {
    const playPauseMatch = msg.content.match(/Play\/Pause.*?encontrado:\s*(\w+).*?clickable:\s*(\w+)/s);
    const nextMatch = msg.content.match(/Next.*?encontrado:\s*(\w+).*?clickable:\s*(\w+)/s);
    const dobleTapMatch = msg.content.match(/Doble tap.*?intentado:\s*(\w+).*?resultado:\s*(\w+)/s);
    
    deviceData.estadoBotones = {
      playPause: playPauseMatch ? {
        encontrado: playPauseMatch[1],
        clickable: playPauseMatch[2]
      } : null,
      next: nextMatch ? {
        encontrado: nextMatch[1],
        clickable: nextMatch[2]
      } : null,
      dobleTap: dobleTapMatch ? {
        intentado: dobleTapMatch[1],
        resultado: dobleTapMatch[2]
      } : null,
      timestamp: new Date().toISOString()
    };
    deviceData.critico = false; // Si detecta botones, el script está corriendo
    
    console.log(`🔘 Estado de botones actualizado para ${device}`);
  }

  saveData(data);
});

// --- Slash command /ask ---
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "ask") {
    const pregunta = interaction.options.getString("pregunta").toLowerCase();
    const data = loadData();

    let respuesta = "";

    // Preguntas sobre el estado del bot
    if (pregunta.match(/est(á|a)s?\s+(vivo|activo|funcionando|online|disponible)/i) || 
        pregunta.match(/(cómo|como)\s+est(á|a)s/i) ||
        pregunta.includes("status") || 
        pregunta.includes("estado del bot")) {
      const numDevices = Object.keys(data.devices).length;
      respuesta = `✅ ¡Estoy activo y funcionando perfectamente!\n\n📊 **Estado actual:**\n- ${numDevices} dispositivo(s) registrado(s)\n- Monitoreando canal: ${process.env.CHANNEL_ID}\n- Último inicio: ${new Date().toLocaleString('es-ES')}`;
    }
    
    // Preguntas generales: "¿Cómo va todo?", "¿Todo bien?"
    else if (pregunta.match(/(c(ó|o)mo\s+(va|anda|est(á|a))\s+todo|todo\s+(bien|ok|okay)|general|overview)/i)) {
      const devices = Object.keys(data.devices);
      if (devices.length === 0) {
        respuesta = "📭 No hay dispositivos registrados aún.";
      } else {
        const ahora = new Date().getTime();
        const HORA_MS = 60 * 60 * 1000;
        
        let saludables = 0;
        let conProblemas = 0;
        let criticos = 0;
        let caidos = 0;
        
        const resumen = devices.map(dev => {
          const info = data.devices[dev];
          const tiempoSinReporte = info.ultimoReporte ? ahora - new Date(info.ultimoReporte).getTime() : Infinity;
          const horasSinReporte = (tiempoSinReporte / HORA_MS).toFixed(1);
          
          let icono = '✅';
          let estado = 'OK';
          
          if (info.critico) {
            icono = '🚨';
            estado = 'CRÍTICO';
            criticos++;
          } else if (tiempoSinReporte > 2 * HORA_MS) {
            icono = '💀';
            estado = 'SIN REPORTAR';
            caidos++;
          } else if (info.errores.slice(-3).length > 0 || info.warnings.slice(-3).length > 0) {
            icono = '⚠️';
            estado = 'Con problemas';
            conProblemas++;
          } else {
            saludables++;
          }
          
          return `${icono} **${dev}**: ${estado} (${horasSinReporte}h desde último reporte)`;
        }).join('\n');
        
        const totalDevices = devices.length;
        respuesta = `📊 **Resumen General - ${totalDevices} dispositivos**\n\n` +
                   `✅ Saludables: ${saludables}\n` +
                   `⚠️ Con problemas: ${conProblemas}\n` +
                   `🚨 Críticos: ${criticos}\n` +
                   `💀 Sin reportar (>2h): ${caidos}\n\n` +
                   `**Detalle:**\n${resumen}`;
      }
    }
    
    // Dispositivos caídos o sin reportar
    else if (pregunta.match(/(se\s+ca(y|i)(ó|o)|ca(í|i)dos?|sin\s+reportar|no\s+reportan|inactivos?)/i)) {
      const devices = Object.keys(data.devices);
      if (devices.length === 0) {
        respuesta = "📭 No hay dispositivos registrados.";
      } else {
        const ahora = new Date().getTime();
        const HORA_MS = 60 * 60 * 1000;
        const UMBRAL_CAIDO = 2 * HORA_MS; // 2 horas sin reportar
        
        const caidos = devices.filter(dev => {
          const info = data.devices[dev];
          const tiempoSinReporte = info.ultimoReporte ? ahora - new Date(info.ultimoReporte).getTime() : Infinity;
          return tiempoSinReporte > UMBRAL_CAIDO || info.critico;
        });
        
        if (caidos.length === 0) {
          respuesta = `✅ ¡Todos los ${devices.length} dispositivos están reportando correctamente!`;
        } else {
          const lista = caidos.map(dev => {
            const info = data.devices[dev];
            const tiempoSinReporte = info.ultimoReporte ? ahora - new Date(info.ultimoReporte).getTime() : Infinity;
            const horasSinReporte = (tiempoSinReporte / HORA_MS).toFixed(1);
            const ultimoReporte = info.ultimoReporte ? new Date(info.ultimoReporte).toLocaleString('es-ES') : 'Nunca';
            const motivo = info.critico ? `🚨 CRÍTICO: ${info.motivoCritico}` : `💀 Sin reportar (${horasSinReporte}h)`;
            return `**${dev}**\n   ${motivo}\n   Último reporte: ${ultimoReporte}`;
          }).join('\n\n');
          
          respuesta = `⚠️ **${caidos.length} de ${devices.length} dispositivos tienen problemas:**\n\n${lista}`;
        }
      }
    }
    
    // Dispositivos críticos
    else if (pregunta.match(/(cr(í|i)ticos?|emergencia|alerta)/i)) {
      const devices = Object.keys(data.devices);
      const criticos = devices.filter(dev => data.devices[dev].critico);
      
      if (criticos.length === 0) {
        respuesta = `✅ No hay dispositivos en estado crítico.`;
      } else {
        const lista = criticos.map(dev => {
          const info = data.devices[dev];
          const ultimoReporte = new Date(info.ultimoReporte).toLocaleString('es-ES');
          return `🚨 **${dev}**\n   Motivo: ${info.motivoCritico}\n   Último reporte: ${ultimoReporte}`;
        }).join('\n\n');
        
        respuesta = `🚨 **${criticos.length} dispositivo(s) en estado CRÍTICO:**\n\n${lista}`;
      }
    }
    
    // Listar todos los dispositivos
    else if (pregunta.match(/(qu(é|e)|cu(á|a)ntos|lista|todos)\s+(dispositivos|devices)/i) || 
             pregunta.includes("qué dispositivos") ||
             pregunta.includes("lista dispositivos")) {
      const devices = Object.keys(data.devices);
      if (devices.length === 0) {
        respuesta = "📭 No hay dispositivos registrados aún. Esperando mensajes del webhook...";
      } else {
        const deviceList = devices.map((dev, i) => {
          const info = data.devices[dev];
          const lastUpdate = new Date(info.ultimoReporte).toLocaleString('es-ES');
          return `${i + 1}. **${dev}** - Último reporte: ${lastUpdate} (${info.pausas.length} pausas)`;
        }).join('\n');
        respuesta = `📱 **Dispositivos registrados (${devices.length}):**\n\n${deviceList}`;
      }
    }
    
    // Información detallada de un dispositivo específico
    else if (pregunta.match(/info(rmación)?\s+(de|del)?\s*device/i) || 
             pregunta.match(/device\s+(\S+)/i)) {
      const matchDevice = pregunta.match(/device\s*(\S+)/i);
      const device = matchDevice ? matchDevice[1] : Object.keys(data.devices)[0];
      const info = data.devices[device];
      
      if (!info) {
        respuesta = `❌ No encontré información del device "${device}". Dispositivos disponibles: ${Object.keys(data.devices).join(', ') || 'ninguno'}`;
      } else {
        const lastUpdate = new Date(info.ultimoReporte).toLocaleString('es-ES');
        const pausasList = info.pausas.map((p, i) => `  ${i + 1}. ${p.hora} (${p.duracion} min)`).join('\n');
        respuesta = `📱 **Device ${device}**\n\n⏰ Último reporte: ${lastUpdate}\n📋 Pausas registradas: ${info.pausas.length}\n\n${pausasList || '  Sin pausas registradas'}`;
      }
    }
    
    // Última pausa
    else if (pregunta.match(/(última|ultima|last)\s+pausa/i)) {
      const matchDevice = pregunta.match(/device\s*(\S+)/i);
      const device = matchDevice ? matchDevice[1] : Object.keys(data.devices)[0];
      const info = data.devices[device];
      
      if (!info || info.pausas.length === 0) {
        respuesta = `❌ No hay pausas registradas${device ? ` para ${device}` : ''}.`;
      } else {
        const ultima = info.pausas[info.pausas.length - 1];
        respuesta = `🕒 **Última pausa${device ? ` de ${device}` : ''}:**\n\nHora: ${ultima.hora}\nDuración: ${ultima.duracion} minutos`;
      }
    }
    
    // Próxima pausa
    else if (pregunta.match(/(próxima|proxima|next|siguiente)\s+pausa/i)) {
      respuesta = `🔮 No tengo horarios futuros registrados aún. Solo guardo el historial de pausas que ya ocurrieron.`;
    }
    
    // Cuántas pausas
    else if (pregunta.match(/(cu(á|a)ntas|total)\s+pausas/i)) {
      const matchDevice = pregunta.match(/device\s*(\S+)/i);
      const device = matchDevice ? matchDevice[1] : Object.keys(data.devices)[0];
      const info = data.devices[device];
      
      if (!info) {
        respuesta = `❌ No encontré información${device ? ` del device "${device}"` : ''}.`;
      } else {
        respuesta = `📊 **${device}** tiene **${info.pausas.length} pausa(s)** registrada(s)`;
      }
    }
    
    // Errores
    else if (pregunta.match(/(errores?|errors?|tiene errores|últimos? errores?)/i)) {
      const matchDevice = pregunta.match(/device\s*(\S+)/i);
      const device = matchDevice ? matchDevice[1] : Object.keys(data.devices)[0];
      const info = data.devices[device];
      
      if (!info) {
        respuesta = `❌ No encontré información${device ? ` del device "${device}"` : ''}.`;
      } else if (info.errores.length === 0) {
        respuesta = `✅ **${device}** no tiene errores registrados. ¡Todo bien!`;
      } else {
        const ultimosErrores = info.errores.slice(-5).reverse();
        const errorList = ultimosErrores.map((e, i) => {
          const tiempo = new Date(e.timestamp).toLocaleString('es-ES');
          return `${i + 1}. **${e.tipo}** (${tiempo})\n   ${e.excepcion || 'Sin detalles'}\n   Repetición: ${e.repeticion || 'N/A'}`;
        }).join('\n\n');
        respuesta = `❌ **${device}** - Últimos ${ultimosErrores.length} errores:\n\n${errorList}\n\n📊 Total: ${info.errores.length} errores`;
      }
    }
    
    // Warnings
    else if (pregunta.match(/(warnings?|advertencias?|tiene warnings|últimos? warnings?)/i)) {
      const matchDevice = pregunta.match(/device\s*(\S+)/i);
      const device = matchDevice ? matchDevice[1] : Object.keys(data.devices)[0];
      const info = data.devices[device];
      
      if (!info) {
        respuesta = `❌ No encontré información${device ? ` del device "${device}"` : ''}.`;
      } else if (info.warnings.length === 0) {
        respuesta = `✅ **${device}** no tiene warnings registrados. ¡Todo bien!`;
      } else {
        const ultimosWarnings = info.warnings.slice(-5).reverse();
        const warningList = ultimosWarnings.map((w, i) => {
          const tiempo = new Date(w.timestamp).toLocaleString('es-ES');
          return `${i + 1}. **${w.tipo}** (${tiempo})\n   ${w.descripcion}\n   Repetición: ${w.repeticion || 'N/A'}`;
        }).join('\n\n');
        respuesta = `⚠️ **${device}** - Últimos ${ultimosWarnings.length} warnings:\n\n${warningList}\n\n📊 Total: ${info.warnings.length} warnings`;
      }
    }
    
    // Estado de botones
    else if (pregunta.match(/(botones?|estado.*botones?|detección.*botones?)/i)) {
      const matchDevice = pregunta.match(/device\s*(\S+)/i);
      const device = matchDevice ? matchDevice[1] : Object.keys(data.devices)[0];
      const info = data.devices[device];
      
      if (!info || !info.estadoBotones) {
        respuesta = `❌ No hay información de botones${device ? ` para ${device}` : ''}.`;
      } else {
        const btn = info.estadoBotones;
        const tiempo = new Date(btn.timestamp).toLocaleString('es-ES');
        const ppStatus = btn.playPause ? `${btn.playPause.encontrado === 'si' ? '✅' : '❌'} Encontrado: ${btn.playPause.encontrado}, Clickable: ${btn.playPause.clickable}` : '❌ No detectado';
        const nextStatus = btn.next ? `${btn.next.encontrado === 'si' ? '✅' : '❌'} Encontrado: ${btn.next.encontrado}, Clickable: ${btn.next.clickable}` : '❌ No detectado';
        const tapStatus = btn.dobleTap ? `${btn.dobleTap.resultado === 'ok' ? '✅' : '❌'} Intentado: ${btn.dobleTap.intentado}, Resultado: ${btn.dobleTap.resultado}` : '❌ No detectado';
        
        respuesta = `🔘 **Estado de botones - ${device}**\n\n` +
                   `**Play/Pause:** ${ppStatus}\n` +
                   `**Next:** ${nextStatus}\n` +
                   `**Doble Tap:** ${tapStatus}\n\n` +
                   `⏰ Última detección: ${tiempo}`;
      }
    }
    
    // Plan diario / Estimado de canciones
    else if (pregunta.match(/(plan.*diario|cuántas.*canciones|estimado.*canciones)/i)) {
      const matchDevice = pregunta.match(/device\s*(\S+)/i);
      const device = matchDevice ? matchDevice[1] : Object.keys(data.devices)[0];
      const info = data.devices[device];
      
      if (!info) {
        respuesta = `❌ No encontré información${device ? ` del device "${device}"` : ''}.`;
      } else {
        let planInfo = '';
        if (info.planDiario) {
          const generado = new Date(info.planDiario.generadoEn).toLocaleString('es-ES');
          planInfo = `📅 **Plan diario:**\n` +
                    `- Inicio: ${info.planDiario.inicio}\n` +
                    `- Total pausas: ${info.planDiario.totalPausas}\n` +
                    `- Generado: ${generado}\n\n`;
        }
        const canciones = info.estimadoCanciones ? `🎵 **Estimado canciones (24h):** ${info.estimadoCanciones}` : '🎵 Sin estimado de canciones';
        respuesta = planInfo + canciones || `❌ No hay plan diario registrado para ${device}`;
      }
    }
    
    // Salud general (health check)
    else if (pregunta.match(/(salud|health|estado general|resumen|overview)/i)) {
      const matchDevice = pregunta.match(/device\s*(\S+)/i);
      const device = matchDevice ? matchDevice[1] : Object.keys(data.devices)[0];
      const info = data.devices[device];
      
      if (!info) {
        respuesta = `❌ No encontré información${device ? ` del device "${device}"` : ''}.`;
      } else {
        const lastUpdate = new Date(info.ultimoReporte).toLocaleString('es-ES');
        const erroresRecientes = info.errores.slice(-3).length;
        const warningsRecientes = info.warnings.slice(-3).length;
        const status = (erroresRecientes === 0 && warningsRecientes === 0) ? '✅ Saludable' : '⚠️ Con problemas';
        
        respuesta = `📊 **Resumen de ${device}**\n\n` +
                   `**Estado:** ${status}\n` +
                   `**Último reporte:** ${lastUpdate}\n` +
                   `**Pausas:** ${info.pausas.length}\n` +
                   `**Errores:** ${info.errores.length} (${erroresRecientes} recientes)\n` +
                   `**Warnings:** ${info.warnings.length} (${warningsRecientes} recientes)\n` +
                   `**Botones:** ${info.estadoBotones ? '✅ Detectados' : '❌ No detectados'}`;
      }
    }
    
    // Respuesta por defecto si no entiende
    else {
      respuesta = `🤔 No entendí tu pregunta. Puedo ayudarte con:\n\n` +
                  `• **Resumen general**: "¿Cómo va todo?" / "¿Todo bien?"\n` +
                  `• **Dispositivos caídos**: "¿Se cayó algún equipo?" / "Dispositivos caídos"\n` +
                  `• **Críticos**: "Dispositivos críticos" / "Alertas"\n` +
                  `• **Estado del bot**: "¿Estás activo?" / "status"\n` +
                  `• **Dispositivos**: "Lista dispositivos" / "Qué dispositivos"\n` +
                  `• **Salud**: "Salud device ABC" / "Resumen device XYZ"\n` +
                  `• **Pausas**: "Última pausa" / "Cuántas pausas device ABC"\n` +
                  `• **Errores**: "Errores device ABC" / "Últimos errores"\n` +
                  `• **Warnings**: "Warnings device ABC" / "Advertencias"\n` +
                  `• **Botones**: "Estado botones device ABC"\n` +
                  `• **Plan diario**: "Plan diario device ABC" / "Cuántas canciones"`;
    }

    await interaction.reply(respuesta);
  }
});

// --- Registrar el comando ---
async function registerCommand() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const command = new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Hazle una pregunta al bot sobre los dispositivos")
    .addStringOption(opt => opt.setName("pregunta").setDescription("Tu pregunta").setRequired(true));

  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [command.toJSON()] });
  console.log("✅ Comando /ask registrado");
}

// --- Servidor Web ---
const app = express();
app.get("/", (req, res) => res.send("Bot activo"));
app.listen(3000, () => console.log("🌐 Servidor web iniciado en puerto 3000"));

// --- Iniciar Discord Bot ---
client.once("clientReady", () => console.log(`✅ Bot iniciado como ${client.user.tag}`));
registerCommand().then(() => client.login(process.env.DISCORD_TOKEN));
