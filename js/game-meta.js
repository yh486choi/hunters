export function readGameForm(){return {date:document.getElementById('gameDate').value,time:document.getElementById('gameTime').value,opponent:document.getElementById('opponent').value.trim()};}
export function fillGameForm(game={}){document.getElementById('gameDate').value=game.date||'';document.getElementById('gameTime').value=game.time||'';document.getElementById('opponent').value=game.opponent||'';}
export function scheduleText(game={}){
  if(!game.date)return '경기일 미정';
  const date=new Date(`${game.date}T00:00:00Z`);
  if(Number.isNaN(date.getTime()))return '경기일 미정';
  return `${game.date} (${'일월화수목금토'[date.getUTCDay()]}) ${game.time||'시간 미정'}`;
}
export function gameTitle(game={}){return `${scheduleText(game)} · ${game.opponent||'상대팀 미정'}`;}
