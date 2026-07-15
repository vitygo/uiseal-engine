export function Card() {
  return (
    <div className="px-4 mt-[13px] text-blue-500 bg-[#ff5733]
                    rounded-[7px] text-[15px]">
      <p className={`text-sm px-[99px]`}>Hello</p>
      <span className={cn('mt-2', 'text-[#abc]')}>World</span>
    </div>
  );
}
