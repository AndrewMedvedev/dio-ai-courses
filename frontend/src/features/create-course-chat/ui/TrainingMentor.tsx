import { useState } from 'react';
import { AiChatPanel } from '@/shared/ui/ai-chat';
import { ChatComposer, ChatMessage } from '@/shared/ui/ai-chat';

/** Учебный ответ показывает механику помощника без запроса к модели. */
export function TrainingMentor() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; text: string }[]
  >([]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-help="lesson-mentor"
        className="tw:fixed tw:right-[24px] tw:bottom-[24px] tw:z-[45] tw:inline-flex tw:min-h-[46px] tw:items-center tw:justify-center tw:gap-[10px] tw:rounded-full tw:border-0 tw:bg-(--contrast) tw:px-[28px] tw:py-[12px] tw:text-[14px] tw:font-semibold tw:text-(--text-solid) tw:cursor-pointer"
      >
        ✦ Спросить ИИ
      </button>
      <AiChatPanel
        open={open}
        onClose={() => setOpen(false)}
        title="Помощник по уроку"
        subtitle="Учебный пример · без запросов к ИИ"
      >
        <div
          className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-[16px] tw:overflow-y-auto tw:p-[16px]"
          aria-label="Учебный диалог с помощником"
          aria-live="polite"
        >
          <ChatMessage
            role="assistant"
            text="Спросите о переменных или типах данных. В знакомстве помощник показывает готовые пояснения; рабочий помощник отвечает на вопросы по вашему уроку."
            copyable={false}
            size="md"
          />
          {messages.map((message, index) => (
            <ChatMessage key={index} {...message} copyable={false} size="md" />
          ))}
        </div>
        <ChatComposer
          value={input}
          onChange={setInput}
          placeholder="Например: чем отличаются int и float?"
          ariaLabel="Вопрос учебному помощнику"
          onSubmit={() => {
            const text = input.trim();
            if (!text) return;
            const response = /int|float|тип|type/iu.test(text)
              ? 'int хранит целые числа, например 24. float — числа с дробной частью, например 3.14. Функция type(value) показывает тип значения.'
              : /print|выв[ео]д/iu.test(text)
                ? 'Функция print() выводит значения. Например: print(name, age, is_student). Имена переменных пишутся без кавычек, строковые значения — в кавычках.'
                : 'Переменная связывает имя со значением: name = "Анна". Затем значение можно использовать по имени. Попробуйте изменить name, age и is_student в практике и вывести их через print().';
            setMessages((previous) => [
              ...previous,
              { role: 'user', text },
              { role: 'assistant', text: response },
            ]);
            setInput('');
          }}
          hint={false}
        />
      </AiChatPanel>
    </>
  );
}
