/**
 * 세로 화면에서 미디어를 꽉 채워 보여줄지, 잘리지 않게 전부 보여줄지 판정한다.
 *
 * 화면을 꽉 채우는 방식(object-cover)은 넘치는 부분을 잘라낸다. 어느 쪽이
 * 잘리는지는 미디어 비율만으로 정해지지 않고 기기 화면 비율에 따라 달라진다.
 * 9:16 영상도 화면이 9:19.5인 기기에서는 좌우가 18~20% 잘려 나간다.
 */

/** 비율이 이 정도 안에서 비슷하면 여백을 만들지 않고 꽉 채운다. */
export const FIT_TOLERANCE = 1.02

/**
 * 미디어를 잘라내지 않고 전부 보여줘야 하는지 판정한다.
 *
 * @param mediaRatio 미디어의 가로 나누기 세로 값
 * @param boxRatio   미디어를 담는 영역의 가로 나누기 세로 값
 * @returns true면 전부 보여주고(object-contain) 남는 자리에 여백이 생긴다.
 *          false면 영역을 꽉 채우며(object-cover) 넘치는 부분이 잘린다.
 */
export function shouldFitContain(mediaRatio: number, boxRatio: number): boolean {
  if (!Number.isFinite(mediaRatio) || mediaRatio <= 0) return false
  if (!Number.isFinite(boxRatio) || boxRatio <= 0) return false
  return mediaRatio > boxRatio * FIT_TOLERANCE
}
