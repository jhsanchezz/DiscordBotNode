# Discord Bot - AutoJS QA Bot Assistant

## Overview
Bot de Discord inteligente que monitorea y analiza mensajes de webhook sobre dispositivos AutoJS, capturando errores, warnings, pausas, estado de botones y más. Permite hacer consultas en lenguaje natural mediante el comando `/ask`.

## Funcionalidades

### 📥 Monitoreo Automático
El bot detecta y almacena diferentes tipos de mensajes del webhook:
- **Planes diarios**: Horarios de pausas y estimado de canciones
- **Status updates**: Reportes cada 30 min con horas transcurridas, canciones y pausas
- **Errores**: JavaExceptions y errores de ejecución (ErrorTakePause, SleepInterrupted, etc.)
- **Warnings**: Advertencias como PauseButtonNotFound, NextButtonNotFound
- **Mensajes críticos**: Detección de scripts detenidos (Next button not found)
- **Estado de botones**: Detección de Play/Pause, Next, y resultados de doble tap
- **Estadísticas**: Estimado de canciones reproducidas en 24h

### 🗄️ Almacenamiento Inteligente
- Guarda hasta 50 errores y 50 warnings por dispositivo
- Mantiene historial completo de pausas
- Registra último estado conocido de cada dispositivo
- Datos persistentes en archivo JSON local

### 💬 Consultas en Lenguaje Natural
Pregunta al bot en español de forma conversacional usando `/ask`

## Configuración
El bot utiliza las siguientes variables de entorno (ya configuradas en Replit Secrets):
- `DISCORD_TOKEN`: Token del bot de Discord
- `CHANNEL_ID`: ID del canal donde llegan los mensajes del webhook
- `CLIENT_ID`: ID de la aplicación en Discord

## Estructura del Proyecto
- `index.js`: Código principal del bot con detección inteligente de mensajes
- `data.json`: Base de datos JSON con toda la información de dispositivos (auto-generado)
- `package.json`: Configuración de Node.js con type: "module" para ES6 imports

## Estructura de Datos
Cada dispositivo almacena:
```json
{
  "pausas": [...],           // Array con horarios y duración de pausas
  "warnings": [...],         // Últimos 50 warnings con timestamp
  "errores": [...],          // Últimos 50 errores con detalles
  "statusUpdates": [...],    // Últimos 20 reportes de status (cada 30 min)
  "planDiario": {...},       // Info del plan: inicio, total pausas
  "estadoBotones": {...},    // Estado de Play/Pause, Next, doble tap
  "estimadoCanciones": 1600, // Estimado de canciones en 24h
  "critico": false,          // true si el script se detuvo (Next not found)
  "motivoCritico": null,     // Razón del estado crítico
  "ultimoReporte": "..."     // Timestamp del último mensaje
}
```

## Detección de Dispositivos Caídos
El bot considera que un dispositivo está "caído" si:
- No ha reportado en más de 2 horas
- Está en estado crítico (script detenido por error fatal)

Puedes consultar esto con: `/ask ¿se cayó algún equipo?`

## Comandos Disponibles
El bot entiende **preguntas en lenguaje natural** en español:

### 🌍 Preguntas Generales (NUEVO)
- `/ask ¿Cómo va todo?` - Resumen completo de todos los dispositivos
- `/ask ¿Todo bien?` - Vista rápida del estado general
- `/ask ¿Se cayó algún equipo?` - Detecta dispositivos sin reportar (>2h)
- `/ask dispositivos caídos` - Lista equipos con problemas
- `/ask dispositivos críticos` - Muestra dispositivos en estado crítico

### 🤖 Estado del Bot
- `/ask ¿Estás activo?`
- `/ask ¿Cómo estás?`
- `/ask status`

### 📱 Dispositivos
- `/ask ¿Qué dispositivos hay?`
- `/ask lista dispositivos`
- `/ask info device A032`

### 🩺 Salud y Resumen
- `/ask salud device A032` - Resumen completo del dispositivo
- `/ask resumen device A011` - Estado general, errores, warnings
- `/ask health device XYZ`

### 🕒 Pausas
- `/ask última pausa`
- `/ask última pausa device A032`
- `/ask cuántas pausas device A011`
- `/ask plan diario device A032` - Muestra el plan completo de pausas

### ❌ Errores
- `/ask errores device A034` - Muestra últimos 5 errores
- `/ask últimos errores device A011`
- `/ask tiene errores device XYZ`

### ⚠️ Warnings
- `/ask warnings device A032`
- `/ask advertencias device A011`
- `/ask tiene warnings`

### 🔘 Estado de Botones
- `/ask estado botones device A032`
- `/ask botones device A011`
- `/ask detección botones`

### 🎵 Estadísticas
- `/ask cuántas canciones device A032`
- `/ask estimado canciones device A011`

**Nota**: El bot reconoce variaciones naturales (con/sin tildes, singular/plural). Si no especificas un device, usa el primero disponible.

## Ejecución
El bot se ejecuta automáticamente con el workflow configurado. Para iniciar manualmente:
```bash
node index.js
```

## Servidor Web
El bot incluye un pequeño servidor web en el puerto 3000 para mantener el proceso activo.
- **URL**: `http://localhost:3000`
- **Endpoint**: `GET /` retorna "Bot activo"

## Notas Técnicas
- Usa ES6 modules (import/export)
- Requiere Node.js 16.9.0 o superior
- Utiliza discord.js v14
- Servidor Express en puerto 3000
- No se utilizó la integración nativa de Discord de Replit según preferencia del usuario
