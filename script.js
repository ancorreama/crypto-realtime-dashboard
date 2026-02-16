console.log("✅ script.js cargó");

/**
 * Fuente de datos y modelado (PUNTOS EXTRA)
 * Fuente principal: CoinCap WebSocket (tiempo real)
 * Fallback: Binance WebSocket (si CoinCap falla o no responde)
 */

// Ventana móvil para mantener la gráfica legible
const MAX_PUNTOS = 120; // ajusta 60–300 según tu preferencia

// Si CoinCap no manda datos en X ms, activamos fallback automático
const TIMEOUT_SIN_DATOS_MS = 8000;

var preciosEndPoint = null;
var usandoFuente = "CoinCap";
let timerSinDatos = null;

function reiniciarTimerSinDatos() {
  if (timerSinDatos) clearTimeout(timerSinDatos);
  timerSinDatos = setTimeout(() => {
    console.warn("⚠️ CoinCap no envió datos a tiempo. Activando fallback Binance...");
    conectarBinance();
  }, TIMEOUT_SIN_DATOS_MS);
}

function conectarCoinCap() {
  usandoFuente = "CoinCap";
  if (timerSinDatos) clearTimeout(timerSinDatos);
  if (preciosEndPoint) {
    try { preciosEndPoint.close(); } catch (e) {}
  }

  const ws = new WebSocket(
    "wss://ws.coincap.io/prices?assets=bitcoin,ethereum,monero,litecoin"
  );

  ws.onopen = () => {
    console.log("✅ CoinCap conectado");
    reiniciarTimerSinDatos();
  };

  ws.onerror = (e) => {
    console.warn("❌ CoinCap error. Activando Binance...", e);
    conectarBinance();
  };

  ws.onclose = (e) => {
    console.warn("⚠️ CoinCap cerrado. Activando Binance...", e);
    conectarBinance();
  };

  ws.onmessage = (msg) => {
    reiniciarTimerSinDatos();
    procesarNuevoMensajeCoinCap(msg);
  };

  preciosEndPoint = ws;
}

function conectarBinance() {
  usandoFuente = "Binance";
  if (timerSinDatos) clearTimeout(timerSinDatos);
  if (preciosEndPoint) {
    try { preciosEndPoint.close(); } catch (e) {}
  }

  const ws = new WebSocket(
    "wss://stream.binance.com:9443/stream?streams=btcusdt@miniTicker/ethusdt@miniTicker/xmrusdt@miniTicker/ltcusdt@miniTicker"
  );

  ws.onopen = () => console.log("✅ Binance conectado (fallback)");
  ws.onerror = (e) => console.warn("❌ Binance error", e);
  ws.onmessage = procesarNuevoMensajeBinance;

  preciosEndPoint = ws;
}

/**
 * Modelado: estructura interna que alimenta la visualización
 */
const monedas = [
  { nombre: "bitcoin",  precioActual: null, precioMasAlto: null, precioMasBajo: null, datos: [] },
  { nombre: "ethereum", precioActual: null, precioMasAlto: null, precioMasBajo: null, datos: [] },
  { nombre: "monero",   precioActual: null, precioMasAlto: null, precioMasBajo: null, datos: [] },
  { nombre: "litecoin", precioActual: null, precioMasAlto: null, precioMasBajo: null, datos: [] }
];

/**
 * Visualización y textos dinámicos
 */

// Elementos de texto (Módulo 1 y contexto)
var contexto1 = document.getElementById('contexto1');
var contexto2 = document.getElementById('contexto2');
var reloj = document.getElementById('reloj');
var contador = document.getElementById('contador');

// Contador de lecturas (tiempo real)
var tickCount = 0;

function actualizarModuloTiempoReal() {
  tickCount += 1;
  const ahora = new Date();

  if (reloj) reloj.innerText = `Última actualización: ${ahora.toLocaleString()}`;
  if (contador) contador.innerText = `Lecturas recibidas: ${tickCount}`;

  // (Opcional) si luego agregas <p id="fuente"></p> en HTML, lo puedes activar
  var fuenteEl = document.getElementById('fuente');
  if (fuenteEl) fuenteEl.innerText = `Fuente activa: ${usandoFuente}`;
}

// Formato moneda
var formatoUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/**
 * Gráfica (D3)
 */
var margen = { top: 10, right: 30, bottom: 30, left: 100 };
var ancho = 800 - margen.left - margen.right;
var alto = 400 - margen.top - margen.bottom;

// Contenedor SVG
const svg = d3
  .select('#modulo2')
  .append('svg')
  .attr('width', ancho + margen.left + margen.right)
  .attr('height', alto + margen.top + margen.bottom)
  .append('g')
  .attr('transform', `translate(${margen.left},${margen.top})`);

// Escalas y ejes
const x = d3.scaleTime().range([0, ancho]);
const ejeX = d3.axisBottom().scale(x);
svg.append('g').attr('transform', `translate(0, ${alto})`).attr('class', 'ejeX');

const y = d3.scaleLinear().range([alto, 0]);
const ejeY = d3.axisLeft().scale(y);
svg.append('g').attr('class', 'ejeY');

// Banda de variación (min–max)
svg.append('rect')
  .attr('class', 'banda')
  .attr('x', 0)
  .attr('width', ancho)
  .attr('opacity', 0.12);

// Marcador del último punto + etiqueta
svg.append('circle')
  .attr('class', 'ultimoPunto')
  .attr('r', 5);

svg.append('text')
  .attr('class', 'ultimoTexto')
  .attr('font-size', 12)
  .attr('dy', '-0.8em');

/**
 * MENÚ
 */
var menu = document.getElementById("menuMonedas");

menu.onchange = function() {
  var objetoMoneda = monedas.find(function(obj) { return obj.nombre === menu.value });
  actualizar(objetoMoneda);
};

/**
 * Handlers de fuentes
 */
function procesarNuevoMensajeCoinCap(mensaje) {
  // CoinCap: {"bitcoin":"68400.12"} (puede incluir varias)
  var data = JSON.parse(mensaje.data);
  if (!data) return;

  for (var nombreMoneda in data) {
    var nuevoPrecio = Number(data[nombreMoneda]);
    if (Number.isNaN(nuevoPrecio)) continue;
    actualizarModelo(nombreMoneda, nuevoPrecio);
  }
}

function procesarNuevoMensajeBinance(mensaje) {
  // Binance: { stream: "...", data: { s: "BTCUSDT", c: "..." } }
  var data = JSON.parse(mensaje.data);
  if (!data || !data.data || !data.data.s) return;

  var map = {
    BTCUSDT: "bitcoin",
    ETHUSDT: "ethereum",
    XMRUSDT: "monero",
    LTCUSDT: "litecoin"
  };

  var nombreMoneda = map[data.data.s];
  if (!nombreMoneda) return;

  var nuevoPrecio = Number(data.data.c);
  if (Number.isNaN(nuevoPrecio)) return;

  actualizarModelo(nombreMoneda, nuevoPrecio);
}

// Lógica común: actualiza tu modelo y refresca dashboard
function actualizarModelo(nombreMoneda, nuevoPrecio) {
  for (var i = 0; i < monedas.length; i++) {
    var objetoMoneda = monedas[i];
    if (objetoMoneda.nombre !== nombreMoneda) continue;

    objetoMoneda.datos.push({
      fecha: Date.now(),
      precio: nuevoPrecio
    });

    if (objetoMoneda.datos.length > MAX_PUNTOS) {
      objetoMoneda.datos.shift();
    }

    objetoMoneda.precioActual = nuevoPrecio;
    actualizarModuloTiempoReal();

    if (!objetoMoneda.precioMasAlto || objetoMoneda.precioMasAlto < nuevoPrecio) {
      objetoMoneda.precioMasAlto = nuevoPrecio;
    }
    if (!objetoMoneda.precioMasBajo || objetoMoneda.precioMasBajo > nuevoPrecio) {
      objetoMoneda.precioMasBajo = nuevoPrecio;
    }

    if (menu && menu.value === nombreMoneda) {
      actualizar(objetoMoneda);
    }
  }
}

/**
 * Actualiza textos + gráfica
 */
function actualizar(objetoMoneda) {
  if (!objetoMoneda || objetoMoneda.datos.length === 0) return;

  contexto1.innerText = `Actualmente, el precio de ${menu.value} es ${formatoUSD.format(objetoMoneda.precioActual)} USD.`;

  var precioInicial = objetoMoneda.datos[0].precio;

  if (precioInicial < objetoMoneda.precioActual) {
    var diferencia = objetoMoneda.precioActual - precioInicial;
    contexto2.innerText = `Subió ${formatoUSD.format(diferencia)} en el periodo mostrado.`;
  } else if (precioInicial > objetoMoneda.precioActual) {
    var diferencia2 = precioInicial - objetoMoneda.precioActual;
    contexto2.innerText = `Bajó ${formatoUSD.format(diferencia2)} en el periodo mostrado.`;
  } else {
    contexto2.innerText = 'No cambió en el periodo mostrado.';
  }

  x.domain(d3.extent(objetoMoneda.datos, d => d.fecha));
  svg.selectAll('.ejeX').transition().duration(300).call(ejeX);

  const minP = d3.min(objetoMoneda.datos, d => d.precio);
  const maxP = d3.max(objetoMoneda.datos, d => d.precio);

  y.domain([minP, maxP]);
  svg.selectAll('.ejeY').transition().duration(300).call(ejeY);

  const rango = maxP - minP;
  let etiquetaMovimiento = "estable";
  if (rango > 0) etiquetaMovimiento = "movida";

  contexto2.innerText += ` | Rango reciente: ${formatoUSD.format(rango)} (más ${etiquetaMovimiento})`;

  svg.select('.banda')
    .transition()
    .duration(300)
    .attr('y', y(maxP))
    .attr('height', Math.max(0, y(minP) - y(maxP)));

  const linea = svg.selectAll('.linea').data([objetoMoneda.datos]);

  linea
    .join('path')
    .attr('class', 'linea')
    .transition()
    .duration(300)
    .attr('d',
      d3.line()
        .x(d => x(d.fecha))
        .y(d => y(d.precio))
    )
    .attr('fill', 'none')
    .attr('stroke', '#42b3f5')
    .attr('stroke-width', 2.5);

  const ultimo = objetoMoneda.datos[objetoMoneda.datos.length - 1];

  svg.select('.ultimoPunto')
    .transition()
    .duration(300)
    .attr('cx', x(ultimo.fecha))
    .attr('cy', y(ultimo.precio));

  svg.select('.ultimoTexto')
    .transition()
    .duration(300)
    .attr('x', x(ultimo.fecha) + 8)
    .attr('y', y(ultimo.precio))
    .text(`${formatoUSD.format(ultimo.precio)}`);
}

// Arrancamos con CoinCap como fuente principal
conectarCoinCap();
