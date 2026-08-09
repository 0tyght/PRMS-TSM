const CENTER = [16.755, 100.195];
const KM_PER_DEG_LAT = 111.32;
const LNG_KM_PER_DEG = KM_PER_DEG_LAT * Math.cos((CENTER[0] * Math.PI) / 180);
const positions = [
  [11,-1.33,-1.62],[4,-1.82,-.98],[10,-1.79,-.47],[5,0,-.63],[3,1.39,-.52],[2,2.46,-.39],
  [6,-1.79,0],[7,-.04,.21],[1,2,.25],[8,.68,.77],[9,-.62,1.98],
];
export function kmToLatLng(x,y){return[CENTER[0]-y/KM_PER_DEG_LAT,CENTER[1]+x/LNG_KM_PER_DEG]}
function polygon(cx,cy,r=.24){return Array.from({length:6},(_,i)=>{const a=Math.PI*(60*i-30)/180;return kmToLatLng(cx+r*Math.cos(a),cy+r*Math.sin(a))})}
export const MAP_CENTER=CENTER;
export const MAP_VILLAGES=positions.map(([id,cx,cy])=>({id,name:`หมู่ ${id}`,center:kmToLatLng(cx,cy),polygon:polygon(cx,cy)})).sort((a,b)=>a.id-b.id);
export const MAP_BOUNDS=MAP_VILLAGES.flatMap(v=>v.polygon);

export function fallbackPosition(villageNo,index=0){const village=MAP_VILLAGES.find(v=>v.id===Number(villageNo))||MAP_VILLAGES[0];const angle=(index*137.5)*Math.PI/180;const distance=.00035+.00012*(index%4);return[village.center[0]+Math.sin(angle)*distance,village.center[1]+Math.cos(angle)*distance]}
