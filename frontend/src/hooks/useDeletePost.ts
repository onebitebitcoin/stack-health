import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import client from '../api/client'
import { getApiErrorMessage } from '../api/errors'

type PostsPage = { posts: { id: number }[] }

const MY_POSTS_KEY = ['my-posts']

/**
 * 내 영상 삭제. 확인 즉시 `my-posts` 캐시에서 빼고(낙관적 삭제) 서버가 거절하면 되돌린다.
 * R2 파일 정리는 백엔드가 응답 뒤 백그라운드로 처리한다.
 */
export function useDeletePost() {
  const { t } = useTranslation('profile')
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (postId: number) => client.delete(`/videos/posts/${postId}`),
    onMutate: async (postId: number) => {
      await queryClient.cancelQueries({ queryKey: MY_POSTS_KEY })
      const previous = queryClient.getQueryData<PostsPage>(MY_POSTS_KEY)
      queryClient.setQueryData<PostsPage>(
        MY_POSTS_KEY,
        (old) => old ? { ...old, posts: old.posts.filter((p) => p.id !== postId) } : old
      )
      return { previous }
    },
    onSuccess: () => {
      toast.success(t('deleteSuccess'))
    },
    onError: (err, _postId, context) => {
      if (context?.previous) queryClient.setQueryData(MY_POSTS_KEY, context.previous)
      toast.error(getApiErrorMessage(err, t('deleteFailed')))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] })
      queryClient.invalidateQueries({ queryKey: ['my-stats'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })
}
