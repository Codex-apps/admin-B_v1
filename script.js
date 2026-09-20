// ================= ⚙️ SUPABASE — ISI INI =================
const SB_URL = 'https://txndsvswrukdcydwkyag.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bmRzdnN3cnVrZGN5ZHdreWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDQ5ODUsImV4cCI6MjEwNTQ4MDk4NX0.W-rLCdQXYPLdDonhBU8CLIA67hGAIQwgQD7fgDQcqoo';
// =========================================================

const sb = supabase.createClient(SB_URL, SB_KEY);

// ================= STATE =================
let products=[], vouchers=[], zones=[];
let settings = {
  storeName:"Tokoku", storeEmoji:"🛍️", flashTitle:"⚡ Flash Sale! Diskon s.d 40%",
  waNumber:"", csEmail:"", csInstagram:"", csHours:"08.00 - 21.00 WIB (Setiap Hari)",
  banks:[{bank:"BCA",no:"1234567890",an:"Nama Kamu"}],
  qrisImg:"",
  heroTitle:"🔥 Yuk Belanja, Ada Diskon Spesial Hari Ini!",
  categories:["Semua","Makanan","Minuman","Fashion","Elektronik"],
  storeLat:"-6.200000", storeLng:"106.816666",
  ongkirMode:"jarak",
  ongkirBase:5000, ongkirPerKm:2000, ongkirMaxKm:25, freeShipMin:150000,
  legal:{syarat:"",privasi:"",faq:"",garansi:""}
};
let cart = JSON.parse(localStorage.getItem('cart')||'[]');
let user = JSON.parse(localStorage.getItem('user')||'null');
let page='home', activeCat='Semua', pendingOrder=null, addrNoteUsed=null,
    gpsData=null, selectedBank=null, usedVoucher=null, chosenZone=null;

// ================= UTIL =================
const $=id=>document.getElementById(id);
const fmt=n=>'Rp'+Number(n||0).toLocaleString('id-ID');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function toast(m,ms=2600){const t=$('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),ms);}
function openModal(id){$(id).style.display='flex';}
function closeModal(id){$(id).style.display='none';}
function saveCart(){localStorage.setItem('cart',JSON.stringify(cart));}
function saveUser(){localStorage.setItem('user',JSON.stringify(user));}
const me=()=>user||{nama:"Guest",username:"guest",phone:"",address:"",lat:"",lng:""};

// ================= JARAK (Haversine) =================
function distKm(lat1,lng1,lat2,lng2){
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function calcOngkir(){
  const u=me();
  if(!u.lat||!u.lng)return null;
  const km=distKm(+settings.storeLat,+settings.storeLng,+u.lat,+u.lng);
  if(km>settings.ongkirMaxKm)return {km,fee:null,out:true};
  return {km:km.toFixed(1),fee:settings.ongkirBase+Math.ceil(km)*settings.ongkirPerKm};
}
function zoneFee(){
  if(!chosenZone)return null;
  const z=zones.find(z=>z.id===chosenZone);
  return z?{km:z.km,fee:z.fee,name:z.name}:null;
}
function getOngkir(){return settings.ongkirMode==='zona'?zoneFee():calcOngkir();}

// ================= CLOUD LOAD (semua read-only via RLS publik) =================
async function cloudLoad(){
  try{
    const [p,s,v,z] = await Promise.all([
      sb.from('products').select('*').order('id'),
      sb.from('settings').select('data').eq('id',1).maybeSingle(),
      sb.from('vouchers').select('*').order('id'),
      sb.from('zones').select('*').order('id')]);
    if(p.data) products = p.data.map(x=>({id:x.id,name:x.name,price:x.price,old:x.old_price,
      stock:x.stock,desc:x.descr,flash:x.flash,img:x.img,cat:x.category||'Umum',weight:x.weight||1}));
    if(s.data?.data && Object.keys(s.data.data).length) settings={...settings,...s.data.data,
      legal:{...settings.legal,...(s.data.data.legal||{})}};
    if(v.data) vouchers=v.data.map(x=>({id:x.id,code:x.code,disc:x.disc}));
    if(z.data) zones=z.data;
  }catch(e){ toast('⚠️ Koneksi cloud gagal, mode offline'); console.error(e); }
  renderCatBar(); renderHome(); trackVisitCloud();
}
async function trackVisitCloud(){
  try{ await sb.rpc('increment_visits',{d:new Date().toISOString().slice(0,10)}); }catch(e){}
}

// ================= WHATSAPP & TELEPON =================
function waOpen(text){
  if(!settings.waNumber){toast('⚠️ CS belum diatur oleh admin');openCS();return false;}
  const no=settings.waNumber.replace(/^0/,'62').replace(/[^0-9]/g,'');
  window.open(`https://wa.me/${no}?text=${encodeURIComponent(text)}`,'_blank');
  return false;
}
function csChat(){
  const u=me();
  waOpen(`Halo ${settings.storeEmoji} ${settings.storeName}! 👋\n`+
    (user?`Saya ${u.nama} (@${u.username}).\n`:'')+`Saya mau tanya-tanya tentang produk.`);
  return false;
}
function callStore(){
  if(!settings.waNumber){toast('⚠️ Nomor toko belum diatur');return false;}
  window.open(`tel:+${settings.waNumber.replace(/^0/,'62').replace(/[^0-9]/g,'')}`,'_blank');
  return false;
}
function waOrderToAdmin(o){
  const u=me();
  let msg=`*🧾 PESANAN BARU — ${settings.storeName.toUpperCase()}*\n━━━━━━━━━━━━━━━\n`;
  msg+=`📋 No. Order: *${o.kode}*\n📅 ${new Date().toLocaleString('id-ID')}\n\n👤 *PEMBELI*\nNama: ${u.nama}\nHP: ${u.phone||'-'}\n\n🛍 *PRODUK:*\n`;
  o.items.forEach(i=>msg+=`• ${i.name} ×${i.qty} = ${fmt(i.price*i.qty)}\n`);
  msg+=`\n💰 Subtotal: ${fmt(o.sub)}\n🚚 Ongkir (${o.ongkirLabel}): ${o.ongkirFee===0?'GRATIS 🎉':fmt(o.ongkirFee)}\n`;
  if(o.voucher) msg+=`🎟 Voucher: ${o.voucher} (−${fmt(o.disc)})\n`;
  msg+=`💰 *TOTAL: ${fmt(o.total)}*\n🏦 Bayar via: ${o.bank}\n`;
  msg+=`\n📍 *ALAMAT:*\n${o.address}\n🎯 https://maps.google.com/?q=${o.lat},${o.lng}\n`;
  if(addrNoteUsed) msg+=`\n📝 Patokan: ${addrNoteUsed}\n`;
  msg+=`\n✅ Mohon konfirmasi setelah transfer. Terima kasih! 🙏`;
  waOpen(msg);
}

// ================= NAV =================
function nav(p){
  page=p;
  document.querySelectorAll('.bnav-i').forEach(el=>el.classList.remove('active'));
  const el=$('nav-'+p); if(el)el.classList.add('active');
  if(p==='home')renderHome();else if(p==='flash')renderFlash();
  else if(p==='cart')renderCart();else renderProfile();
  window.scrollTo(0,0);
}

// ================= KATEGORI =================
function renderCatBar(){
  const cats=Array.from(new Set([...(settings.categories||[]),'Semua']));
  $('catBar').innerHTML=cats.map(c=>
    `<button class="cat-chip ${c===activeCat?'on':''}" onclick="pickCat('${esc(c)}')">${esc(c)}</button>`).join('');
}
function pickCat(c){activeCat=c;renderCatBar();renderHome();}

// ================= HOME =================
function renderHome(){
  $('hName').textContent=settings.storeName;$('hEmoji').textContent=settings.storeEmoji;
  $('flashText').textContent=settings.flashTitle;
  const q=($('searchInput').value||'').toLowerCase();
  let list=products.filter(p=>p.name.toLowerCase().includes(q));
  if(activeCat!=='Semua') list=list.filter(p=>p.cat===activeCat);
  $('content').innerHTML=`
    <div class="sect">${esc(settings.heroTitle)}</div>
    ${list.length?`<div class="grid">${list.map(p=>`
      <div class="pcard" onclick="openProduct(${p.id})">
        ${p.old>p.price?'<span class="ptag">-'+Math.round((1-p.price/p.old)*100)+'%</span>':''}
        ${p.img?`<img src="${p.img}" loading="lazy">`:`<div style="height:130px;background:linear-gradient(135deg,var(--primary-2),var(--primary));display:flex;align-items:center;justify-content:center;font-size:2.5rem">🛍️</div>`}
        <div class="pbody"><div class="pname">${esc(p.name)}</div>
        <div class="pcat">🏷 ${esc(p.cat)}</div>
        <div class="pprice">${fmt(p.price)} ${p.old>p.price?`<span class="pold">${fmt(p.old)}</span>`:''}</div></div>
      </div>`).join('')}</div>`
    :`<div class="empty"><div class="e">📦</div><p>Produk tidak ditemukan di kategori ini</p></div>`}
    <div class="sect">ℹ️ Kenapa Belanja di Sini?</div>
    <div class="grid" style="padding-top:10px">
      <div class="pcard" onclick="openLegal('garansi')"><div class="pbody" style="text-align:center;padding:16px"><div style="font-size:2rem">✅</div><b style="font-size:.8rem">Garansi 100%</b></div></div>
      <div class="pcard" onclick="openLegal('faq')"><div class="pbody" style="text-align:center;padding:16px"><div style="font-size:2rem">❓</div><b style="font-size:.8rem">FAQ</b></div></div>
    </div>`;
}
function renderFlash(){
  $('content').innerHTML=`<div class="sect">⚡ ${esc(settings.flashTitle)}</div>
  <div class="grid">${products.filter(p=>p.flash).map(p=>`
    <div class="pcard" onclick="openProduct(${p.id})">
      <span class="ptag">FLASH</span>
      ${p.img?`<img src="${p.img}" loading="lazy">`:`<div style="height:130px;background:linear-gradient(135deg,#fd79a8,#e17055);display:flex;align-items:center;justify-content:center;font-size:2.5rem">⚡</div>`}
      <div class="pbody"><div class="pname">${esc(p.name)}</div><div class="pprice">${fmt(p.price)}</div></div>
    </div>`).join('')||'<div class="empty"><div class="e">⚡</div><p>Belum ada promo</p></div>'}</div>`;
}

// ================= DETAIL PRODUK =================
function openProduct(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  $('productContent').innerHTML=`
    ${p.img?`<img src="${p.img}" style="width:100%;height:220px;object-fit:cover">`:`<div style="height:200px;background:linear-gradient(135deg,var(--primary-2),var(--primary));display:flex;align-items:center;justify-content:center;font-size:4rem">🛍️</div>`}
    <div class="pad">
      <span class="ptag" style="position:static;display:inline-block;background:var(--primary-2)">🏷 ${esc(p.cat)}</span>
      <h3 style="margin-top:8px">${esc(p.name)}</h3>
      <div style="font-size:1.3rem;font-weight:800;color:var(--primary);margin:8px 0">${fmt(p.price)}
        ${p.old>p.price?`<span style="font-size:.85rem;color:var(--text-dim);text-decoration:line-through">${fmt(p.old)}</span>`:''}</div>
      <p style="font-size:.82rem;color:var(--text-dim);line-height:1.7">${esc(p.desc||'-')}</p>
      <p style="font-size:.75rem;margin-top:8px">📦 Stok: <b>${p.stock}</b> · ⚖️ Berat: ${p.weight} kg</p>
      <button class="big-btn" onclick="addToCart(${p.id})">🛒 Tambah ke Keranjang</button>
      <button class="big-btn wa" onclick="buyNow(${p.id})">⚡ Beli Sekarang</button>
      <button class="big-btn" style="background:var(--wa)" onclick="return waOpen('Halo, saya mau tanya produk: *${esc(p.name)}* (${fmt(p.price)})')">💬 Tanya CS Produk Ini</button>
      <button class="big-btn" style="background:var(--primary-2)" onclick="return callStore()">📞 Telepon Toko</button>
    </div>`;
  openModal('productModal');
}
function addToCart(id){
  const p=products.find(x=>x.id===id);
  if(p.stock<1){toast('❌ Stok habis');return;}
  const ex=cart.find(c=>c.id===id);
  if(ex){ if(ex.qty>=p.stock){toast('⚠️ Stok hanya '+p.stock);return;} ex.qty++; }
  else cart.push({id,name:p.name,price:p.price,img:p.img,qty:1,weight:p.weight||1,cat:p.cat});
  saveCart();updateBadge();toast('✅ Ditambahkan ke keranjang');closeModal('productModal');
}
function buyNow(id){addToCart(id);if(cart.length){closeModal('productModal');nav('cart');}}
function updateBadge(){$('cartBadge').textContent=cart.reduce((a,c)=>a+c.qty,0);}
updateBadge();

// ================= KERANJANG =================
function renderCart(){
  if(!cart.length){$('content').innerHTML=`<div class="empty"><div class="e">🛒</div><p>Keranjang kosong</p><button class="big-btn" style="max-width:200px;margin:16px auto 0" onclick="nav('home')">Belanja Sekarang</button></div>`;return;}
  const sub=cart.reduce((a,c)=>a+c.price*c.qty,0);
  $('content').innerHTML=`<div class="sect">🛒 Keranjang</div><div style="padding:14px">
    ${cart.map((c,i)=>`<div class="citem">
      ${c.img?`<img src="${c.img}">`:`<div style="width:64px;height:64px;border-radius:10px;background:var(--primary-2);display:flex;align-items:center;justify-content:center;font-size:1.5rem">🛍️</div>`}
      <div style="flex:1"><b style="font-size:.8rem">${esc(c.name)}</b><div class="pcat">🏷 ${esc(c.cat)}</div><div class="pprice">${fmt(c.price)}</div>
      <div class="qty" style="margin-top:6px"><button onclick="chQty(${i},-1)">−</button><b style="font-size:.8rem">${c.qty}</b><button onclick="chQty(${i},1)">+</button>
      <span style="margin-left:auto;color:var(--danger);cursor:pointer;font-size:.75rem" onclick="delItem(${i})">Hapus</span></div></div>
    </div>`).join('')}
    <div class="cs-hours"><b>Subtotal:</b> ${fmt(sub)}
    ${settings.freeShipMin>0&&sub<settings.freeShipMin?`<div class="free-ship" style="margin-top:8px">🚚 Belanja ${fmt(settings.freeShipMin-sub)} lagi untuk GRATIS ONGKIR!</div>`:''}</div>
    <button class="big-btn" onclick="openCheckout()">Checkout →</button>
  </div>`;
}
function chQty(i,d){cart[i].qty+=d;if(cart[i].qty<1)cart.splice(i,1);saveCart();updateBadge();renderCart();}
function delItem(i){cart.splice(i,1);saveCart();updateBadge();renderCart();}

// ================= CHECKOUT =================
function openCheckout(){
  if(!user){toast('⚠️ Daftar/login dulu ya!');openAuth();return;}
  selectedBank=null;usedVoucher=null;chosenZone=null;
  renderCheckout();openModal('detailModal');$('detailTitle').textContent='Checkout';
}
function renderCheckout(){
  const sub=cart.reduce((a,c)=>a+c.price*c.qty,0);
  const ship=getOngkir();
  const freeShip = settings.freeShipMin>0 && sub>=settings.freeShipMin;
  let disc=0;
  if(usedVoucher){const v=vouchers.find(v=>v.code===usedVoucher);if(v)disc=Math.round(sub*v.disc/100);}
  const ongkirFee = freeShip?0:(ship?.fee??null);
  const total = sub + (ongkirFee??0) - disc;

  let ongkirHTML='';
  if(settings.ongkirMode==='zona'){
    ongkirHTML=`<label>🚚 Pilih Zona Pengiriman</label>
    <div class="menu-list">${zones.map(z=>`
      <div class="menu-item" onclick="chosenZone=${z.id};renderCheckout()">
      <span class="em">${chosenZone===z.id?'🔵':'⚪'}</span>
      <div><b>${esc(z.name)}</b> <small style="color:var(--text-dim)">≈ ${z.km} km</small></div>
      <span class="arrow" style="font-weight:800;color:var(--primary)">${fmt(z.fee)}</span></div>`).join('')
      ||'<div class="menu-item">⚠️ Belum ada zona (atur di admin)</div>'}</div>`;
  } else {
    ongkirHTML = !ship
      ? `<div class="free-ship" style="border-color:var(--primary);color:var(--primary)">📍 Ambil GPS dulu agar ongkir dihitung otomatis</div>`
      : ship.out
        ? `<div class="free-ship" style="border-color:var(--danger);color:var(--danger)">❌ Lokasi di luar jangkauan (${ship.km} km, maks ${settings.ongkirMaxKm} km). Hubungi CS.</div>`
        : `<div class="cs-hours" style="margin-top:10px">🚚 Jarak dari toko: <b>${ship.km} km</b> → Ongkir otomatis: <b class="ongkir-ok">${fmt(ship.fee)}</b></div>`;
  }

  $('detailContent').innerHTML=`
  <div class="pad">
    <label>📍 Alamat Pengiriman</label>
    <div class="cs-hours" style="cursor:pointer" onclick="closeModal('detailModal');openAddr()">${me().address?`<b>${esc(me().nama)}</b> · ${esc(me().phone)}<br>${esc(me().address)}`:'⚠️ Belum ada alamat — klik untuk isi'}</div>
    ${ongkirHTML}
    <label>🎟 Kode Voucher</label>
    <div style="display:flex;gap:8px"><input id="vInput" placeholder="Masukkan kode"><button class="big-btn" style="width:auto;padding:10px 16px;margin:0" onclick="applyVoucher()">Pakai</button></div>
    <label>🏦 Metode Pembayaran</label>
    <div class="menu-list">${(settings.banks||[]).map((b,i)=>`
      <div class="menu-item" onclick="pickBank(${i})"><span class="em">${selectedBank===i?'🔵':'⚪'}</span>
      <div><b>${esc(b.bank)}</b> <small style="color:var(--text-dim)">${esc(b.no)} a/n ${esc(b.an)}</small></div></div>`).join('')}
      ${settings.qrisImg?`<div class="menu-item" onclick="pickQRIS()"><span class="em">${selectedBank==='qris'?'🔵':'⚪'}</span>
      <div><b>📱 QRIS</b> <small style="color:var(--text-dim)">Semua e-wallet/m-banking</small></div></div>`:''}
    </div>
    <div class="cs-hours" style="margin-top:12px">
      <div class="ongkir-row"><span>Subtotal produk</span><b>${fmt(sub)}</b></div>
      <div class="ongkir-row"><span>Ongkir ${ship?.km?`(${ship.km} km)`:''}</span><b>${freeShip?'<span class="ongkir-ok">GRATIS 🎉</span>':(ongkirFee===null?'—':fmt(ongkirFee))}</b></div>
      ${disc?`<div class="ongkir-row"><span>Voucher ${esc(usedVoucher)}</span><b style="color:var(--danger)">−${fmt(disc)}</b></div>`:''}
      <div class="ongkir-total"><span>Total Bayar</span><span style="color:var(--primary)">${fmt(total)}</span></div>
    </div>
    ${settings.freeShipMin>0&&!freeShip?`<div class="free-ship">🎉 Gratis ongkir untuk belanja min. ${fmt(settings.freeShipMin)}</div>`:''}
    <button class="big-btn" onclick="createOrder()" ${(selectedBank!==null&&me().address&&ongkirFee!==null)?'':'disabled'}>📤 Buat Pesanan</button>
    <button class="big-btn wa" onclick="return csChat()">💬 Tanya CS Dulu via WhatsApp</button>
    <p style="font-size:.7rem;color:var(--text-dim);margin-top:10px;text-align:center">
      Dengan memesan kamu menyetujui <span style="color:var(--primary);cursor:pointer" onclick="openLegal('syarat')">Syarat & Ketentuan</span></p>
  </div>`;
}
function pickBank(i){selectedBank=i;renderCheckout();}
function pickQRIS(){selectedBank='qris';renderCheckout();}
function applyVoucher(){
  const code=$('vInput').value.trim().toUpperCase();
  const v=vouchers.find(v=>v.code===code);
  if(!v){toast('❌ Voucher tidak valid');return;}
  usedVoucher=code;toast('✅ Voucher dipakai: '+v.disc+'%');renderCheckout();
}
function openAddr(){
  const u=me();
  $('addrName').value=u.nama||'';$('addrPhone').value=u.phone||'';
  $('addrText').value=u.address||'';$('addrNote').value='';
  gpsData=null;
  $('gpsStatus').textContent=u.lat?`🎯 GPS tersimpan: ${u.lat}, ${u.lng}`:'';
  openModal('addrModal');
}
function useGPS(){
  $('gpsStatus').textContent='⏳ Mengambil lokasi...';
  navigator.geolocation.getCurrentPosition(
    pos=>{gpsData={lat:pos.coords.latitude.toFixed(6),lng:pos.coords.longitude.toFixed(6)};
      const d=distKm(+settings.storeLat,+settings.storeLng,+gpsData.lat,+gpsData.lng);
      $('gpsStatus').textContent=`✅ GPS akurat: ${gpsData.lat}, ${gpsData.lng} (≈ ${d.toFixed(1)} km dari toko)`;},
    ()=>{$('gpsStatus').textContent='❌ Gagal ambil GPS. Izinkan akses lokasi.';},{enableHighAccuracy:true});
}
function saveAddr(){
  user=user||{};
  user.nama=$('addrName').value;user.phone=$('addrPhone').value;
  user.address=$('addrText').value;addrNoteUsed=$('addrNote').value;
  if(gpsData){user.lat=gpsData.lat;user.lng=gpsData.lng;}
  saveUser();closeModal('addrModal');toast('✅ Alamat & GPS tersimpan — ongkir dihitung otomatis');
  renderCheckout();openModal('detailModal');
}
function createOrder(){
  const sub=cart.reduce((a,c)=>a+c.price*c.qty,0);
  const ship=getOngkir();
  const freeShip=settings.freeShipMin>0&&sub>=settings.freeShipMin;
  let disc=0;if(usedVoucher){const v=vouchers.find(v=>v.code===usedVoucher);if(v)disc=Math.round(sub*v.disc/100);}
  const ongkirFee=freeShip?0:(ship?.fee??0);
  const total=sub+ongkirFee-disc;
  const shipName=freeShip?'GRATIS':(ship?.name?ship.name:(ship?.km+' km')||'ongkir');
  pendingOrder={
    kode:null,
    items:cart.map(c=>({id:c.id,name:c.name,qty:c.qty,price:c.price})),
    sub, ongkirFee, ongkirLabel:shipName, disc, total, voucher:usedVoucher,
    bank:selectedBank==='qris'?'QRIS':settings.banks[selectedBank].bank+' '+settings.banks[selectedBank].no,
    address:me().address,lat:me().lat,lng:me().lng};
  closeModal('detailModal');
  if(selectedBank==='qris'&&settings.qrisImg){
    $('detailTitle').textContent='📱 Bayar via QRIS';
    $('detailContent').innerHTML=`<div class="pad qris-box">
      <h3 style="margin-bottom:6px">Scan QRIS — ${fmt(total)}</h3>
      <img src="${settings.qrisImg}"><div class="cs-hours" style="margin-top:12px">Setelah transfer, upload bukti di bawah.</div>
      <button class="big-btn" onclick="closeModal('detailModal');openBukti()">📤 Upload Bukti Transfer</button></div>`;
    openModal('detailModal');
  } else openBukti();
}
function openBukti(){
  $('buktiBank').textContent=pendingOrder.bank+' — '+fmt(pendingOrder.total);
  $('buktiPreview').style.display='none';$('buktiFile').value='';$('buktiBtn').disabled=false;
  $('buktiBtn').innerHTML='✅ Kirim Pesanan';
  openModal('buktiModal');
}
function previewBukti(inp){
  const f=inp.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{$('buktiPreview').src=e.target.result;$('buktiPreview').style.display='block';};
  r.readAsDataURL(f);
}
async function submitBukti(){
  $('buktiBtn').disabled=true;$('buktiBtn').innerHTML='<span class="spin"></span> Mengirim...';
  const u=me();
  let buktiUrl=null;
  // 1. upload bukti ke folder 'bukti' (satu-satunya folder yang boleh ditulis anon)
  try{
    const f=$('buktiFile').files[0];
    if(f){
      const name='bukti/'+Date.now()+'_'+f.name.replace(/\s/g,'_');
      const {error}=await sb.storage.from('media').upload(name,f,{upsert:true});
      if(error) throw error;
      buktiUrl=sb.storage.from('media').getPublicUrl(name).data.publicUrl;
    }
  }catch(e){ toast('⚠️ Upload bukti gagal, lanjut tanpa bukti'); }

  // 2. checkout via RPC AMAN di server (stok atomik, total dihitung server)
  try{
    const {data:kode,error} = await sb.rpc('checkout',{payload:{
      uname:u.nama, phone:u.phone, address:pendingOrder.address,
      lat:pendingOrder.lat, lng:pendingOrder.lng, note:addrNoteUsed,
      items:pendingOrder.items, ongkir:pendingOrder.ongkirFee,
      disc:pendingOrder.disc, bank:pendingOrder.bank,
      voucher:pendingOrder.voucher, bukti:buktiUrl}});
    if(error) throw error;
    pendingOrder.kode=kode;
  }catch(e){
    toast('❌ '+ (e.message||'Gagal menyimpan pesanan') +'. Cek stok & coba lagi.');
    $('buktiBtn').disabled=false;$('buktiBtn').innerHTML='✅ Kirim Pesanan';
    return;
  }

  closeModal('buktiModal');
  waOrderToAdmin(pendingOrder);
  $('successMsg').textContent=`Order ${pendingOrder.kode} (${fmt(pendingOrder.total)}) terkirim! Termasuk ongkir ${pendingOrder.ongkirLabel}. Detail sudah ke WhatsApp CS.`;
  cart=[];usedVoucher=null;saveCart();updateBadge();cloudLoad(); // refresh stok realtime
  openModal('successModal');
}

// ================= PROFIL =================
function renderProfile(){
  const u=me();
  $('content').innerHTML=`<div class="sect">👤 Akun Saya</div><div style="padding:14px">
    <div class="cs-hero" style="background:linear-gradient(135deg,var(--primary),var(--primary-2))">
      <div class="pavatar">${user?esc(u.nama[0]||'?'):'👤'}</div>
      <h3 style="margin-top:10px">${user?esc(u.nama):'Belum Login'}</h3>
      <p>${user?'@'+esc(u.username):'Daftar untuk mulai belanja'}</p>
    </div>
    ${user?`<div class="menu-list" style="margin-top:12px">
      <div class="menu-item" onclick="openOrders()"><span class="em">📦</span>Pesanan Saya<span class="arrow">›</span></div>
      <div class="menu-item" onclick="openAddr()"><span class="em">📍</span>Ubah Alamat & GPS (Ongkir)<span class="arrow">›</span></div>
      <div class="menu-item" onclick="csChat()"><span class="em">💬</span>Chat CS via WhatsApp<span class="arrow">›</span></div>
      <div class="menu-item" onclick="callStore()"><span class="em">📞</span>Telepon Toko<span class="arrow">›</span></div>
      <div class="menu-item" onclick="openCS()"><span class="em">🛎️</span>Semua Kontak CS<span class="arrow">›</span></div>
      <div class="menu-item" onclick="openLegal('syarat')"><span class="em">📜</span>Syarat & Ketentuan<span class="arrow">›</span></div>
      <div class="menu-item" onclick="openLegal('privasi')"><span class="em">🔒</span>Kebijakan Privasi<span class="arrow">›</span></div>
      <div class="menu-item" onclick="openLegal('faq')"><span class="em">❓</span>FAQ<span class="arrow">›</span></div>
      <div class="menu-item" onclick="openLegal('garansi')"><span class="em">✅</span>Kebijakan Retur & Garansi<span class="arrow">›</span></div>
      <div class="menu-item" style="color:var(--danger)" onclick="logout()"><span class="em">🚪</span>Keluar<span class="arrow">›</span></div>
    </div>`
    :`<button class="big-btn" style="margin-top:14px" onclick="openAuth()">Daftar / Masuk</button>`}
  </div>`;
}
function logout(){localStorage.removeItem('user');user=null;renderProfile();toast('👋 Sampai jumpa!');}
function openAuth(){
  $('detailTitle').textContent='🔐 Daftar / Masuk';
  $('detailContent').innerHTML=`<div class="pad">
    <label>Nama Lengkap</label><input id="auName">
    <label>Username</label><input id="auUser">
    <label>No. HP (untuk lacak pesanan)</label><input id="auPhone" inputmode="numeric">
    <label>Alamat</label><textarea id="auAddr" rows="2"></textarea>
    <button class="big-btn" onclick="doAuth()">✅ Masuk</button></div>`;
  openModal('detailModal');
}
function doAuth(){
  if(!$('auName').value||!$('auUser').value){toast('⚠️ Lengkapi nama & username');return;}
  user={nama:$('auName').value,username:$('auUser').value,phone:$('auPhone').value,address:$('auAddr').value,lat:'',lng:''};
  saveUser();closeModal('detailModal');renderProfile();toast('🎉 Selamat datang, '+user.nama+'!');
}
async function openOrders(){
  if(!user||!user.phone){toast('⚠️ Isi no. HP dulu di akun kamu');openAddr();return;}
  $('detailTitle').textContent='📦 Pesanan Saya';
  $('detailContent').innerHTML='<div class="pad"><span class="spin" style="border-color:var(--border);border-top-color:var(--primary)"></span> Memuat...</div>';
  openModal('detailModal');
  // via RPC — hanya pesanan milik no. HP ini yang dikembalikan server
  const {data:my} = await sb.rpc('my_orders',{p_phone:user.phone});
  $('detailContent').innerHTML=(my||[]).length?my.map(o=>`
    <div class="pad" style="border-bottom:1px solid var(--border)">
      <b style="font-size:.85rem">${o.kode}</b> <span style="font-size:.7rem;color:${o.status==='baru'?'var(--danger)':'var(--success)'}">● ${o.status==='baru'?'Menunggu Konfirmasi':'Selesai'}</span>
      <p style="font-size:.75rem;color:var(--text-dim)">${new Date(o.created_at).toLocaleString('id-ID')} · ${o.items.length} item · <b>${fmt(o.total)}</b></p>
      <p style="font-size:.72rem;color:var(--text-dim)">${o.items.map(i=>esc(i.name)+' ×'+i.qty).join(', ')}</p>
      ${o.bukti?`<img src="${o.bukti}" style="width:80px;border-radius:8px;margin-top:6px">`:''}
      <button class="big-btn" style="background:var(--wa);padding:10px;margin-top:8px" onclick="return waOpen('Halo, saya mau konfirmasi pesanan *${o.kode}*')">💬 Konfirmasi via WA</button>
    </div>`).join(''):`<div class="empty"><div class="e">📦</div><p>Belum ada pesanan</p></div>`;
}

// ================= CS & LEGAL =================
function openCS(){
  $('detailTitle').textContent='💬 Customer Service';
  $('detailContent').innerHTML=`
    <div class="pad">
      <div class="cs-hero"><div class="big">${settings.storeEmoji}</div><h3>Butuh Bantuan?</h3><p>Tim CS kami siap membantu 😊</p></div>
      ${settings.waNumber?`<a class="cs-btn" href="#" onclick="return csChat()"><span class="cs-ic wa">💬</span>
        <div><b>WhatsApp CS</b><small>+${settings.waNumber.replace(/^62/,'0')} · Balas cepat</small></div><span class="arrow">›</span></a>
      <a class="cs-btn" href="#" onclick="return callStore()"><span class="cs-ic em">📞</span>
        <div><b>Telepon Toko</b><small>Hubungi langsung via panggilan</small></div><span class="arrow">›</span></a>`:''}
      ${settings.csInstagram?`<a class="cs-btn" href="https://instagram.com/${settings.csInstagram}" target="_blank"><span class="cs-ic ig">📸</span>
        <div><b>Instagram</b><small>@${settings.csInstagram}</small></div><span class="arrow">›</span></a>`:''}
      ${settings.csEmail?`<a class="cs-btn" href="mailto:${settings.csEmail}"><span class="cs-ic em">📧</span>
        <div><b>Email</b><small>${settings.csEmail}</small></div><span class="arrow">›</span></a>`:''}
      <div class="cs-hours">🕒 <b>Jam Operasional</b><br>${esc(settings.csHours)}<br><br>
        🚚 <b>Ongkir Otomatis</b><br>${settings.ongkirMode==='jarak'
          ?`Dihitung dari jarak GPS kamu ke toko — ${fmt(settings.ongkirBase)} + ${fmt(settings.ongkirPerKm)}/km (maks ${settings.ongkirMaxKm} km).`
          :`Pilih zona pengiriman saat checkout.`}
        ${settings.freeShipMin>0?`<br>🎉 Gratis ongkir belanja min. ${fmt(settings.freeShipMin)}.`:''}</div>
    </div>`;
  openModal('detailModal');
}
function openLegal(type){
  const t={syarat:'📜 Syarat & Ketentuan',privasi:'🔒 Kebijakan Privasi',faq:'❓ FAQ',garansi:'✅ Kebijakan Retur & Garansi'}[type];
  $('detailTitle').textContent=t;
  const d={
    syarat:`<h4>1. Ketentuan Umum</h4><p>Dengan berbelanja di ${esc(settings.storeName)}, kamu menyetujui seluruh syarat ini.</p>
    <h4>2. Ongkir</h4><p>Ongkir dihitung otomatis dari jarak pengiriman atau sesuai zona tarif.</p>
    <h4>3. Pembayaran</h4><p>Transfer hanya ke rekening resmi yang tercantum di aplikasi.</p>`,
    privasi:`<h4>Data yang Kami Kumpulkan</h4><p>Nama, no. HP, alamat & lokasi GPS — hanya untuk pengiriman & perhitungan ongkir.</p>
    <h4>Tidak Dibagikan</h4><p>Kami tidak menjual/membagikan data kamu ke pihak ketiga.</p>`,
    faq:`<h4>Bagaimana ongkir dihitung?</h4><p>Otomatis dari jarak GPS ke toko, atau pilih zona saat checkout.</p>
    <h4>Kapan gratis ongkir?</h4><p>${settings.freeShipMin>0?`Belanja min. ${fmt(settings.freeShipMin)}.`:'Sesuai promo yang berlaku.'}</p>
    <h4>Bisa tanya dulu sebelum beli?</h4><p>Tentu! Klik tombol 💬 Chat CS.</p>`,
    garansi:`<h4>Retur & Penggantian</h4><p>Ajukan maks. <b>3 hari</b> setelah paket diterima dengan <b>video unboxing</b>.</p>
    <h4>Produk Rusak/Salah</h4><p>Diganti baru atau uang kembali 100%.</p>`}[type];
  const custom=settings.legal?.[type];
  $('detailContent').innerHTML=`<div class="pad legal-body">${custom?esc(custom).replace(/\n/g,'<br>'):d}
    <div class="cs-hours" style="margin-top:14px">Terakhir diperbarui: ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</div></div>`;
  openModal('detailModal');
}

function openSearch(){const w=$('searchWrap');w.style.display=w.style.display==='none'?'block':'none';if(w.style.display==='block')$('searchInput').focus();}

// ================= INIT =================
cloudLoad();
sb.channel('prod-live').on('postgres_changes',{event:'*',schema:'public',table:'products'},
  ()=>cloudLoad()).subscribe();
sb.channel('set-live').on('postgres_changes',{event:'*',schema:'public',table:'settings'},
  ()=>cloudLoad()).subscribe();
