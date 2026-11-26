// 방봄 "집 보기" 안에 끼워져 열렸는지(주소 옵션 embed=1). 화면 여러 곳이 같이 본다.
// 끼워져 있으면 방봄 쪽에 이미 메뉴와 이름이 있어서, 이 화면은 머리줄을 줄이고 첫 방문 도움말을 띄우지 않는다.
function readEmbedded(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('embed') === '1'
  } catch {
    return false
  }
}

export const EMBEDDED: boolean = readEmbedded()
