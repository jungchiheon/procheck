// 부드러운 중립/청회계 팔레트
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:'#F6F8FF',100:'#EBEEFF',200:'#D7DFFF',300:'#C3D0FF',
          400:'#AABAF0',500:'#8FA0DA',600:'#7588C7',700:'#5E70A9',800:'#4C5B86',900:'#3D4A6B'
        },
        // 중립 버튼용(짙은 회색)
        ink: {
          700:'#2F3640', 800:'#262B33', 900:'#1E2228'
        }
      },
      boxShadow: {
        soft: '0 10px 30px rgba(15, 23, 42, 0.06)'
      },
      borderRadius: { xl2: '1.25rem' }
    }
  },
  plugins: []
};