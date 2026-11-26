// 스케치업 파일(.dae) 내려받기. 글은 engine/daeExport.js가 만들고, 여기서는 브라우저가 파일로 저장하게만 한다.
// 서버를 거치지 않아서 인터넷이 끊겨도 된다.

import type { ProjectState } from '../types/schema.ts'
import { projectToDae } from '../engine/daeExport.js'

/** 지금 보고 있는 방을 .dae 파일로 내려받는다 */
export function downloadDae(project: ProjectState, fileName: string = '방봄_방.dae'): void {
  const blob = new Blob([projectToDae(project)], { type: 'model/vnd.collada+xml' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // 저장이 시작되기 전에 주소를 지우면 내려받기가 취소되는 브라우저가 있어서 조금 뒤에 지운다
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
