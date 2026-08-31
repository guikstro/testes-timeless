/**
 * Aplica o tema antes da primeira pintura.
 *
 * Sem isto a página nasce clara e pisca para escura assim que o JavaScript
 * roda — o clarão branco na cara de quem escolheu o modo escuro. Por isso é
 * um script síncrono no `<head>`, e não um efeito de componente.
 */
const SCRIPT = `(function(){try{
var t=localStorage.getItem("timeless-theme");
var escuro = t==="dark" || (!t && matchMedia("(prefers-color-scheme: dark)").matches);
if(escuro) document.documentElement.classList.add("dark");
}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
