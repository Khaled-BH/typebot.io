import type { ChatReply, Theme } from 'models'
import { createEffect, createSignal, For, Show } from 'solid-js'
import { sendMessageQuery } from '@/queries/sendMessageQuery'
import { ChatChunk } from './ChatChunk'
import { BotContext, InitialChatReply } from '@/types'
import { isNotDefined } from 'utils'
import { executeClientSideAction } from '@/utils/executeClientSideActions'
import { LoadingChunk } from './LoadingChunk'

const parseDynamicTheme = (
  initialTheme: Theme,
  dynamicTheme: ChatReply['dynamicTheme']
): Theme => ({
  ...initialTheme,
  chat: {
    ...initialTheme.chat,
    hostAvatar:
      initialTheme.chat.hostAvatar && dynamicTheme?.hostAvatarUrl
        ? {
            ...initialTheme.chat.hostAvatar,
            url: dynamicTheme.hostAvatarUrl,
          }
        : initialTheme.chat.hostAvatar,
    guestAvatar:
      initialTheme.chat.guestAvatar && dynamicTheme?.guestAvatarUrl
        ? {
            ...initialTheme.chat.guestAvatar,
            url: dynamicTheme?.guestAvatarUrl,
          }
        : initialTheme.chat.guestAvatar,
  },
})

type Props = {
  initialChatReply: InitialChatReply
  context: BotContext
  onNewInputBlock?: (ids: { id: string; groupId: string }) => void
  onAnswer?: (answer: { message: string; blockId: string }) => void
  onEnd?: () => void
  onNewLogs?: (logs: ChatReply['logs']) => void
}

export const ConversationContainer = (props: Props) => {
  let chatContainer: HTMLDivElement | undefined
  let bottomSpacer: HTMLDivElement | undefined
  const [chatChunks, setChatChunks] = createSignal<
    Pick<ChatReply, 'messages' | 'input' | 'clientSideActions'>[]
  >([
    {
      input: props.initialChatReply.input,
      messages: props.initialChatReply.messages,
      clientSideActions: props.initialChatReply.clientSideActions,
    },
  ])
  const [dynamicTheme, setDynamicTheme] = createSignal<
    ChatReply['dynamicTheme']
  >(props.initialChatReply.dynamicTheme)
  const [theme, setTheme] = createSignal(props.initialChatReply.typebot.theme)
  const [isSending, setIsSending] = createSignal(false)

  createEffect(() => {
    setTheme(
      parseDynamicTheme(props.initialChatReply.typebot.theme, dynamicTheme())
    )
  })

  const sendMessage = async (message: string | undefined) => {
    const currentBlockId = chatChunks().at(-1)?.input?.id
    if (currentBlockId && props.onAnswer && message)
      props.onAnswer({ message, blockId: currentBlockId })
    const longRequest = setTimeout(() => {
      setIsSending(true)
    }, 1000)
    const data = await sendMessageQuery({
      apiHost: props.context.apiHost,
      sessionId: props.initialChatReply.sessionId,
      message,
    })
    clearTimeout(longRequest)
    setIsSending(false)
    if (!data) return
    if (data.logs) props.onNewLogs?.(data.logs)
    if (data.dynamicTheme) setDynamicTheme(data.dynamicTheme)
    if (data.input?.id && props.onNewInputBlock) {
      props.onNewInputBlock({
        id: data.input.id,
        groupId: data.input.groupId,
      })
    }
    setChatChunks((displayedChunks) => [
      ...displayedChunks,
      {
        input: data.input,
        messages: data.messages,
        clientSideActions: data.clientSideActions,
      },
    ])
  }

  const autoScrollToBottom = () => {
    if (!bottomSpacer) return
    setTimeout(() => {
      chatContainer?.scrollTo(0, chatContainer.scrollHeight)
    }, 50)
  }

  const handleAllBubblesDisplayed = async () => {
    const lastChunk = chatChunks().at(-1)
    if (!lastChunk) return
    if (lastChunk.clientSideActions) {
      const actionsToExecute = lastChunk.clientSideActions.filter((action) =>
        isNotDefined(action.lastBubbleBlockId)
      )
      for (const action of actionsToExecute) {
        await executeClientSideAction(action)
      }
    }
    if (isNotDefined(lastChunk.input)) {
      props.onEnd?.()
    }
  }

  const handleNewBubbleDisplayed = async (blockId: string) => {
    const lastChunk = chatChunks().at(-1)
    if (!lastChunk) return
    if (lastChunk.clientSideActions) {
      const actionsToExecute = lastChunk.clientSideActions.filter(
        (action) => action.lastBubbleBlockId === blockId
      )
      for (const action of actionsToExecute) {
        await executeClientSideAction(action)
      }
    }
  }

  const handleSkip = () => sendMessage(undefined)

  return (
    <div
      ref={chatContainer}
      class="overflow-y-scroll w-full min-h-full rounded px-3 pt-10 relative scrollable-container typebot-chat-view scroll-smooth"
    >
      <For each={chatChunks()}>
        {(chatChunk, index) => (
          <ChatChunk
            inputIndex={index()}
            messages={chatChunk.messages}
            input={chatChunk.input}
            theme={theme()}
            settings={props.initialChatReply.typebot.settings}
            isLoadingBubbleDisplayed={isSending()}
            onNewBubbleDisplayed={handleNewBubbleDisplayed}
            onAllBubblesDisplayed={handleAllBubblesDisplayed}
            onSubmit={sendMessage}
            onScrollToBottom={autoScrollToBottom}
            onSkip={handleSkip}
            context={props.context}
          />
        )}
      </For>
      <Show when={isSending()}>
        <LoadingChunk theme={theme()} />
      </Show>
      <BottomSpacer ref={bottomSpacer} />
    </div>
  )
}

type BottomSpacerProps = {
  ref: HTMLDivElement | undefined
}
const BottomSpacer = (props: BottomSpacerProps) => {
  return <div ref={props.ref} class="w-full h-32" />
}